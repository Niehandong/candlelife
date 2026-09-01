"""管理员登录。"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.core import codes
from tests.conftest import body, err, failed
from app.core.password import hash_password
from app.core.security import create_access_token, create_admin_token
from app.models import AdminUser

pytestmark = pytest.mark.asyncio(loop_scope="session")

PASSWORD = "a-strong-dev-password"


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def _clear_login_rate_limit():
    """每个测试前清掉登录限流桶。

    限流走真实 Redis，key 是 admin:login:<IP>，而测试里所有请求都来自同一个
    IP（testclient）。不清的话 60 秒的桶会跨测试累积，第 6 次登录吃 429——
    单文件跑时窗口可能刚好滚过去而侥幸通过，全量跑就红。
    这是清测试间的共享状态，不是把生产代码改成迁就测试。
    """
    from app.core.redis import get_redis, key

    async def _clear():
        client = get_redis()
        if client is None:
            return
        try:
            for ip in ("testclient", "unknown", "127.0.0.1"):
                await client.delete(key("admin", "login", ip))
        except Exception:
            pass          # Redis 不可用时限流本就降级放行，无需清理

    await _clear()
    yield
    await _clear()


async def _make_admin(session, username="alice", active=True) -> AdminUser:
    admin = AdminUser(username=username, hashed_password=hash_password(PASSWORD),
                      is_active=active)
    session.add(admin)
    await session.flush()
    return admin


async def test_login_returns_admin_token(client, session):
    await _make_admin(session)
    r = await client.post("/api/v1/admin/login",
                          json={"username": "alice", "password": PASSWORD})
    assert r.status_code == 200
    payload = body(r)
    assert payload["access_token"]
    assert payload["token_type"] == "bearer"
    assert payload["expires_in"] == 8 * 60 * 60


async def test_login_records_last_login_at(client, session):
    admin = await _make_admin(session, "bob")
    assert admin.last_login_at is None
    await client.post("/api/v1/admin/login",
                      json={"username": "bob", "password": PASSWORD})
    await session.refresh(admin)
    assert admin.last_login_at is not None


async def test_wrong_password_and_unknown_user_are_indistinguishable(client, session):
    """不泄露「这个用户名存在」——两种失败的响应必须逐字相同。"""
    await _make_admin(session, "carol")
    wrong = await client.post("/api/v1/admin/login",
                              json={"username": "carol", "password": "nope"})
    missing = await client.post("/api/v1/admin/login",
                                json={"username": "nobody", "password": "nope"})
    failed(wrong, codes.ADMIN_LOGIN_FAILED)
    failed(missing, codes.ADMIN_LOGIN_FAILED)
    # 整个信封逐字相同 —— 连 msg 都不能有差别，否则就是一条侧信道
    assert wrong.json() == missing.json()


async def test_inactive_admin_cannot_login(client, session):
    await _make_admin(session, "dave", active=False)
    r = await client.post("/api/v1/admin/login",
                          json={"username": "dave", "password": PASSWORD})
    failed(r, codes.ADMIN_INACTIVE)


async def test_me_returns_username(client, session):
    admin = await _make_admin(session, "erin")
    token = create_admin_token(admin.id)
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert body(r)["username"] == "erin"


async def test_me_rejects_user_token(client, session):
    """小程序的 token 打不进管理接口。"""
    token = create_access_token(uuid.uuid4())
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    failed(r, codes.TOKEN_KIND_MISMATCH)


async def test_me_rejects_missing_token(client):
    r = await client.get("/api/v1/admin/me")
    failed(r, codes.TOKEN_MISSING)


async def test_me_rejects_deleted_admin(client):
    """token 有效但账号已被删——不能凭一张过期不了的票进来。"""
    token = create_admin_token(uuid.uuid4())
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    failed(r, codes.ADMIN_NOT_FOUND)


async def test_me_rejects_admin_deactivated_after_login(client, session):
    """8 小时的 token 期间账号被停用，剩余时间内必须立刻失效。"""
    admin = await _make_admin(session, "frank")
    token = create_admin_token(admin.id)
    admin.is_active = False
    await session.flush()
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    failed(r, codes.ADMIN_INACTIVE)


async def test_rate_limit_blocks_sixth_attempt(client, session):
    """同一 IP 每分钟 5 次。第 6 次返回 429。"""
    await _make_admin(session, "grace")
    fake = AsyncMock()
    fake.incr.side_effect = [1, 2, 3, 4, 5, 6]
    fake.expire.return_value = True
    with patch("app.services.admin_auth.get_redis", return_value=fake):
        # 局部变量【不能叫 codes】—— 那会遮蔽 app.core.codes 模块
        got = []
        for _ in range(6):
            r = await client.post("/api/v1/admin/login",
                                  json={"username": "grace", "password": "wrong"})
            got.append(err(r))
    assert got[:5] == [codes.ADMIN_LOGIN_FAILED] * 5
    assert got[5] == codes.TOO_MANY_ATTEMPTS


async def test_rate_limit_degrades_open_when_redis_down(client, session):
    """Redis 是优化不是正确性依赖：它挂了，登录必须照常可用。"""
    await _make_admin(session, "heidi")
    fake = AsyncMock()
    fake.incr.side_effect = ConnectionError("redis down")
    with patch("app.services.admin_auth.get_redis", return_value=fake):
        r = await client.post("/api/v1/admin/login",
                              json={"username": "heidi", "password": PASSWORD})
    assert r.status_code == 200


async def test_rate_limit_degrades_open_when_no_client(client, session):
    await _make_admin(session, "ivan")
    with patch("app.services.admin_auth.get_redis", return_value=None):
        r = await client.post("/api/v1/admin/login",
                              json={"username": "ivan", "password": PASSWORD})
    assert r.status_code == 200


async def test_login_rejects_overlong_password_without_500(client, session):
    """超过 bcrypt 72 字节上限的密码必须是 422，不能冒泡成 500。"""
    await _make_admin(session, "judy")
    r = await client.post("/api/v1/admin/login",
                          json={"username": "judy", "password": "x" * 200})
    # Pydantic 的 max_length 先拦下，走不到 service 里的字节校验
    failed(r, codes.UNPROCESSABLE)


async def test_login_response_never_contains_password_or_hash(client, session):
    await _make_admin(session, "ken")
    r = await client.post("/api/v1/admin/login",
                          json={"username": "ken", "password": PASSWORD})
    body = r.text
    assert PASSWORD not in body
    assert "hashed_password" not in body
    assert "$2b$" not in body

"""运营配置的读写。"""
import json
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select

from app.core.password import hash_password
from app.core.security import create_admin_token
from app.domain.config import DEFAULT_CONFIG, config_to_dict
from app.models import AdminUser, AppConfig

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _admin_headers(session, username="cfgadmin") -> dict:
    admin = AdminUser(username=username, hashed_password=hash_password("x" * 16))
    session.add(admin)
    await session.flush()
    return {"Authorization": f"Bearer {create_admin_token(admin.id)}"}


def _full_payload() -> dict:
    """一份完整合法的配置，测试从它出发改一两个字段。"""
    return config_to_dict(DEFAULT_CONFIG)


# ---------- 读 ----------

async def test_get_config_returns_defaults_when_never_saved(client, session):
    """后台没配过时，读到的是常量默认值，不是 404。"""
    h = await _admin_headers(session)
    r = await client.get("/api/v1/admin/config", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["config"]["app"]["name"] == "烛生"
    assert body["updated_by"] is None
    assert body["updated_at"] is None


async def test_get_config_requires_admin_token(client):
    r = await client.get("/api/v1/admin/config")
    assert r.status_code == 401


async def test_get_config_reads_saved_row(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["app"]["slogan"] = "陪你好好睡"
    session.add(AppConfig(id=1, data=data, updated_by="someone"))
    await session.flush()
    r = await client.get("/api/v1/admin/config", headers=h)
    assert r.json()["config"]["app"]["slogan"] == "陪你好好睡"
    assert r.json()["updated_by"] == "someone"


# ---------- 写 ----------

async def test_put_config_saves_and_is_readable(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 15
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 200
    again = await client.get("/api/v1/admin/config", headers=h)
    assert again.json()["config"]["ritual"]["tolerance_minutes"] == 15
    assert again.json()["updated_by"] == "cfgadmin"


async def test_put_config_overwrites_the_single_row(client, session):
    """单行覆盖：连保存两次，库里仍只有一行。"""
    h = await _admin_headers(session)
    await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    count = await session.scalar(select(func.count()).select_from(AppConfig))
    assert count == 1


async def test_put_config_requires_admin_token(client):
    r = await client.put("/api/v1/admin/config", json=_full_payload())
    assert r.status_code == 401


# ---------- dry_run ----------

async def test_dry_run_reports_changes_without_writing(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 15
    data["app"]["slogan"] = "陪你好好睡"

    r = await client.put("/api/v1/admin/config?dry_run=true", json=data, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["errors"] == []
    assert {c["path"] for c in body["changes"]} == {
        "app.slogan", "ritual.tolerance_minutes"}
    change = next(c for c in body["changes"] if c["path"] == "ritual.tolerance_minutes")
    assert change["from"] == 30
    assert change["to"] == 15

    assert await session.scalar(select(func.count()).select_from(AppConfig)) == 0


async def test_dry_run_of_unchanged_payload_is_empty(client, session):
    h = await _admin_headers(session)
    r = await client.put("/api/v1/admin/config?dry_run=true",
                         json=_full_payload(), headers=h)
    assert r.json()["changes"] == []


# ---------- 校验边界 ----------

@pytest.mark.parametrize("group,field,bad", [
    ("ritual", "tolerance_minutes", -1),
    ("ritual", "tolerance_minutes", 181),
    ("ritual", "gratitude_count", 0),
    ("ritual", "gratitude_count", 6),
    ("ritual", "plan_count", 0),
    ("ritual", "plan_count", 6),
    ("ritual", "resistance_options", []),
    ("ritual", "resistance_options", ["x"] * 9),
    ("ritual", "resistance_options", ["  "]),
    ("ritual", "resistance_options", ["超" * 33]),
    ("ritual", "goodnight_text", ""),
    ("ritual", "goodnight_text", "长" * 201),
    ("app", "name", ""),
    ("app", "slogan", "长" * 201),
    ("schedule", "bedtime", "25:00"),
    ("schedule", "bedtime", "晚上十一点"),
    ("records", "journal_days", 0),
    ("records", "collection_limit", 0),
    ("records", "reward_timing", "whenever"),
])
async def test_invalid_field_returns_422(client, session, group, field, bad):
    h = await _admin_headers(session)
    data = _full_payload()
    data[group][field] = bad
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 422, f"{group}.{field}={bad!r} 本应被拒绝"


async def test_min_time_equal_max_time_is_rejected(client, session):
    """资格窗口宽度为零 = 所有用户永远不合格。这是最贵的一个手滑。"""
    h = await _admin_headers(session)
    data = _full_payload()
    data["schedule"]["min_time"] = "22:00"
    data["schedule"]["max_time"] = "22:00"
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 422


async def test_dry_run_reports_errors_instead_of_422(client, session):
    """dry_run 是预览：校验不过也要把逐字段错误列出来给管理员看。"""
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 999
    r = await client.put("/api/v1/admin/config?dry_run=true", json=data, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("tolerance_minutes" in e["field"] for e in body["errors"])
    assert body["changes"] == []


async def test_unknown_field_is_rejected(client, session):
    """打错字段名必须报错，不能静默丢弃——静默丢弃会让管理员以为保存成功了。"""
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerence_minutes"] = 15          # 故意拼错
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 422


# ---------- 导出 ----------

async def test_export_returns_downloadable_json(client, session):
    h = await _admin_headers(session)
    await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    r = await client.get("/api/v1/admin/config/export", headers=h)
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    assert ".json" in r.headers["content-disposition"]
    assert json.loads(r.text)["app"]["name"] == "烛生"


# ---------- 公开接口的联动 ----------

async def test_public_config_reflects_saved_values(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 15
    data["schedule"]["bedtime"] = "22:45"
    await client.put("/api/v1/admin/config", json=data, headers=h)

    r = await client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["ritual"]["tolerance_minutes"] == 15
    assert r.json()["schedule"]["bedtime"] == "22:45"


async def test_public_config_falls_back_when_row_missing(client):
    """后台从没配过时，小程序仍要能启动。"""
    r = await client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["ritual"]["tolerance_minutes"] == 30
    assert r.json()["schedule"]["bedtime"] == "23:30"


async def test_public_config_falls_back_when_row_is_corrupt(client, session):
    """库里的 JSON 坏了，小程序也必须能启动——坏数据降级，阶段一定下的原则。"""
    session.add(AppConfig(id=1, data={"ritual": {"tolerance_minutes": "三十"}},
                          updated_by="oops"))
    await session.flush()
    r = await client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["ritual"]["tolerance_minutes"] == 30


async def test_public_config_still_needs_no_auth(client):
    r = await client.get("/api/v1/config")
    assert r.status_code == 200


# ---------- Redis ----------

async def test_save_invalidates_redis_cache(client, session):
    h = await _admin_headers(session)
    fake = AsyncMock()
    with patch("app.services.admin_config.get_redis", return_value=fake):
        await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    fake.delete.assert_awaited()


async def test_save_succeeds_when_redis_is_down(client, session):
    """Redis 挂了不能挡住保存。"""
    h = await _admin_headers(session)
    fake = AsyncMock()
    fake.delete.side_effect = ConnectionError("redis down")
    with patch("app.services.admin_config.get_redis", return_value=fake):
        r = await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    assert r.status_code == 200

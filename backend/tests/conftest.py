"""测试基础设施。

【安全护栏，勿删】
本项目与另一个项目共用同一个 PostgreSQL 库，对方的 public schema 里有同名的
users 表。曾发生过一次事故：search_path 含 public 时，drop_all 顺着 search_path
回落，把 public.users 删掉了。以下三道护栏缺一不可：

  1. TEST_DB_SCHEMA 必须显式以 _test 结尾
  2. 建表前断言连接的 current_schema() 就是测试 schema
  3. 断言 search_path 中不含 public
"""
import os

# ── 测试环境强制走微信桩，与 .env 的当前值解耦 ───────────────────
#
# 【为什么必须在这里、在任何 import app.* 之前设】
# get_settings() 带 @lru_cache，第一次调用就把 .env 的值定死了。
# 环境变量优先于 .env 文件，所以在这里设就能盖住它。
#
# 【为什么必须强制】线上要走真微信（WX_MOCK_LOGIN=false），而测试里
# conftest 的 auth_client 用的是 "test-user" 这种假 code。不强制的话，
# 关掉 mock 之后跑一次全量测试 = 向微信发几十次真实请求、用假 code、
# 全部失败、还白白消耗每日配额。测试绝不该依赖外部服务。
#
# tests/test_startup.py 有一条断言守着这件事，防止有人把这几行删掉。
os.environ["WX_MOCK_LOGIN"] = "true"

import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import make_engine
from app.models import Base

def pytest_configure(config):
    """测试运行时的配置，原先在 backend/pytest.ini 里。

    搬到这里是因为运行环境改成了仓库根的 .venv，backend/ 下不再需要一个
    独立的 pytest 配置文件。这四项缺一不可：

      asyncio_mode = auto           26 个测试文件里有 22 个不写 @pytest.mark.asyncio，
                                    strict 模式下它们会被收集但拒绝执行
      两个 loop_scope = session     数据库引擎是 session 级 fixture，
                                    测试与它必须在同一个事件循环里，否则
                                    "attached to a different loop"
      filterwarnings                app 自己代码里的 DeprecationWarning 视为错误，
                                    别让弃用悄悄堆积

    pytest-asyncio 在收集阶段才读 asyncio_mode，且 option 优先于 ini，
    所以这里设 config.option 是有效的；两个 loop_scope 它在自己的
    pytest_configure 里读 ini，得走 addinivalue/inicfg。
    """
    config.option.asyncio_mode = "auto"
    config.inicfg.setdefault("asyncio_default_fixture_loop_scope", "session")
    config.inicfg.setdefault("asyncio_default_test_loop_scope", "session")
    # 用 pytest 自己的 filterwarnings 而不是 warnings.filterwarnings()：
    # pytest 每个测试都在 catch_warnings 上下文里跑，模块级设的过滤器会被重置。
    config.addinivalue_line("filterwarnings", "error::DeprecationWarning:app.*")


# ── 响应信封的读取辅助 ────────────────────────────────────────────
# 所有接口的响应都是 {code, msg, data}（见 app/core/envelope.py）。
# 测试里直接写 r.json()["x"] 会拿到信封而不是载荷，这两个 helper 把这件事
# 收在一处 —— 信封形状再变时只改这里。

def body(response):
    """成功响应的载荷。顺带断言业务码是 200 —— HTTP 2xx 不代表业务成功。"""
    envelope = response.json()
    assert isinstance(envelope, dict) and "code" in envelope, \
        f"响应不是信封形状：{envelope!r}"
    assert envelope["code"] == 200, \
        f"业务码不是 200：code={envelope['code']} msg={envelope.get('msg')!r}"
    return envelope["data"]


def err(response) -> int:
    """失败响应的业务错误码（数字）。"""
    return response.json()["code"]


def failed(response, code: int):
    """断言这是一个失败响应，且业务码正好是 code。

    /api 下 HTTP 状态一律 200（见 app/core/codes.py），所以
    `assert r.status_code == 401` 这种断言已经没有区分力了 ——
    换成断言业务码，测试比原来更强：401 只说「鉴权类」，
    40104（密码错）与 40102（token 失效）则是两回事。

    顺带把三件事一起钉住，省得每处写三行：
      1. HTTP 状态确实是 200（没有漏改成真实状态码的接口）
      2. body 里的业务码正确
      3. X-Biz-Code 响应头与 body 一致（网关按它统计，不能对不上）
    """
    assert response.status_code == 200, (
        f"/api 下的失败响应也该是 HTTP 200，实际 {response.status_code}；"
        f"body={response.text[:200]}")
    envelope = response.json()
    assert envelope["code"] == code, (
        f"业务码不对：期望 {code}，实际 {envelope['code']}（{envelope.get('msg')!r}）")
    assert response.headers.get("X-Biz-Code") == str(code), (
        f"X-Biz-Code 头与 body 对不上："
        f"头={response.headers.get('X-Biz-Code')!r} body={code}")
    return envelope


def msg(response) -> str:
    """失败响应的中文文案。"""
    return response.json()["msg"]


TEST_SCHEMA = os.environ.get("TEST_DB_SCHEMA", "zhusheng_test")

if not TEST_SCHEMA.endswith("_test"):
    raise RuntimeError(
        f"TEST_DB_SCHEMA 必须以 _test 结尾（当前 {TEST_SCHEMA!r}）——"
        "fixture 会 drop_all 重建全部表，指向应用 schema 会清空真实数据。"
    )


async def _assert_isolated(conn):
    """确认这条连接只能看见测试 schema，绝不会回落到 public。"""
    search_path = (await conn.execute(text("SHOW search_path"))).scalar_one()
    parts = {p.strip().strip('"') for p in search_path.split(",")}
    if "public" in parts:
        raise RuntimeError(
            f"search_path 含 public（{search_path!r}）。drop_all 会误删 public 中的同名表。"
        )
    current = (await conn.execute(text("SELECT current_schema()"))).scalar_one()
    if current != TEST_SCHEMA:
        raise RuntimeError(f"current_schema() 是 {current!r}，期望 {TEST_SCHEMA!r}")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine():
    eng = make_engine(TEST_SCHEMA)
    async with eng.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{TEST_SCHEMA}"'))
    async with eng.begin() as conn:
        await _assert_isolated(conn)          # ★ drop_all 之前必须通过
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(loop_scope="session")
async def session(engine):
    """每个测试跑在独立事务中，结束回滚，互不干扰。"""
    conn = await engine.connect()
    trans = await conn.begin()
    # join_transaction_mode="create_savepoint"：service 里的 commit() 只释放
    # savepoint，外层事务仍可整体回滚，测试间互不污染
    maker = async_sessionmaker(bind=conn, expire_on_commit=False, class_=AsyncSession,
                               join_transaction_mode="create_savepoint")
    async with maker() as s:
        yield s
    # 预期 IntegrityError 的测试会让事务进入 aborted 状态，回滚需容错
    if trans.is_active:
        await trans.rollback()
    await conn.close()


@pytest_asyncio.fixture(loop_scope="session")
async def app(session):
    """挂载真实路由的 FastAPI 实例，DB 会话指向测试事务。"""
    from httpx import ASGITransport, AsyncClient  # noqa: F401
    from app.core.db import get_session
    from app.main import create_app

    application = create_app()
    application.dependency_overrides[get_session] = lambda: session
    return application


@pytest_asyncio.fixture(loop_scope="session")
async def client(app):
    from httpx import ASGITransport, AsyncClient
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def auth_client(client):
    """已登录的客户端（mock 登录）。"""
    r = await client.post("/api/v1/auth/wx-login", json={"code": "test-user"})
    client.headers["Authorization"] = f"Bearer {body(r)['access_token']}"
    return client

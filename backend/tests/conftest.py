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

import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import make_engine
from app.models import Base

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
    client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return client

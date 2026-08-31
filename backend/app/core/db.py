from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


def make_engine(schema: str | None = None):
    """按 schema 建引擎。

    生产库的 public schema 已被其他项目占用（含同名 users 表），本项目的对象
    隔离在独立 schema 中。模型不写死 schema，靠连接级 search_path 切换，
    同一套模型即可服务应用库与测试库。
    """
    settings = get_settings()
    target = schema or settings.db_schema
    return create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
        future=True,
        # search_path 只含本项目 schema，绝不含 public：
        # 该库的 public 属于另一个项目且有同名 users 表，
        # 若回落过去会静默读写别人的数据，也会让 Alembic 误判为"表被删除"。
        connect_args={"server_settings": {"search_path": target}},
    )


engine = make_engine()
SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session

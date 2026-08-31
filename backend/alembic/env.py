import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import make_engine
from app.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
SCHEMA = get_settings().db_schema


KNOWN_TABLES = set(target_metadata.tables)   # 不含 alembic_version：Alembic 自行管理其记账表


def _include_object(obj, name, type_, reflected, compare_to):
    """只管本项目的表。

    该库的 public schema 属于另一个项目，autogenerate 若看到它们会生成
    DROP TABLE。这是双保险——search_path 已不含 public。
    """
    if type_ == "table":
        return name in KNOWN_TABLES
    return True


def _run(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        version_table_schema=SCHEMA,
        include_schemas=False,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    engine = make_engine(SCHEMA)
    async with engine.connect() as connection:
        # 本项目对象隔离在独立 schema，public 已被库中其他项目占用
        await connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
        await connection.commit()
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=get_settings().database_url, target_metadata=target_metadata,
                      version_table_schema=SCHEMA)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_async_migrations())

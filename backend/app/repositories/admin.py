import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminUser, AppConfig

CONFIG_ROW_ID = 1


async def get_admin_by_username(session: AsyncSession, username: str) -> AdminUser | None:
    return await session.scalar(select(AdminUser).where(AdminUser.username == username))


async def get_admin(session: AsyncSession, admin_id: uuid.UUID) -> AdminUser | None:
    return await session.get(AdminUser, admin_id)


async def get_app_config(session: AsyncSession) -> AppConfig | None:
    return await session.get(AppConfig, CONFIG_ROW_ID)


async def upsert_app_config(session: AsyncSession, data: dict,
                            updated_by: str) -> AppConfig:
    """单行覆盖。用 ON CONFLICT 而非「先查后写」，避免并发下两个管理员各插一行。"""
    stmt = (
        pg_insert(AppConfig)
        .values(id=CONFIG_ROW_ID, data=data, updated_by=updated_by)
        .on_conflict_do_update(
            index_elements=[AppConfig.id],
            set_={"data": data, "updated_by": updated_by,
                  "updated_at": func.now()})
        .returning(AppConfig)
    )
    row = (await session.execute(stmt)).scalar_one()
    await session.flush()
    return row

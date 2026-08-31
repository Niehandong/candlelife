import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NightRecord


async def insert_if_absent(session: AsyncSession, values: dict) -> None:
    """并发安全的写入：冲突则不插入。正确性由 UNIQUE(user_id, ritual_date) 保证。"""
    await session.execute(
        insert(NightRecord).values(**values).on_conflict_do_nothing(
            index_elements=["user_id", "ritual_date"])
    )


async def get(session: AsyncSession, user_id: uuid.UUID, ritual_date: date) -> NightRecord | None:
    return await session.scalar(
        select(NightRecord).where(NightRecord.user_id == user_id,
                                  NightRecord.ritual_date == ritual_date))


async def list_eligibility(session: AsyncSession, user_id: uuid.UUID,
                           until: date) -> list[tuple[date, bool]]:
    """截至 until 的 (仪式夜, 是否合格) 序列，供连续天数计算。"""
    rows = await session.execute(
        select(NightRecord.ritual_date, NightRecord.is_eligible)
        .where(NightRecord.user_id == user_id, NightRecord.ritual_date <= until)
        .order_by(NightRecord.ritual_date))
    return [(d, e) for d, e in rows.all()]


async def list_range(session: AsyncSession, user_id: uuid.UUID,
                     start: date | None, end: date | None) -> list[NightRecord]:
    stmt = select(NightRecord).where(NightRecord.user_id == user_id)
    if start:
        stmt = stmt.where(NightRecord.ritual_date >= start)
    if end:
        stmt = stmt.where(NightRecord.ritual_date <= end)
    return list(await session.scalars(stmt.order_by(NightRecord.ritual_date.desc())))

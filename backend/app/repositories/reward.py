import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NightRecord, Reward


async def pending_nights(session: AsyncSession, user_id: uuid.UUID,
                         lock: bool = False) -> list[NightRecord]:
    """合格且尚未揭晓的夜记，按仪式夜升序。lock=True 时在事务内锁行。"""
    stmt = (select(NightRecord)
            .where(NightRecord.user_id == user_id,
                   NightRecord.is_eligible.is_(True),
                   NightRecord.reward_revealed_at.is_(None))
            .order_by(NightRecord.ritual_date))
    if lock:
        stmt = stmt.with_for_update()
    return list(await session.scalars(stmt))


async def list_art_ids(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    return list(await session.scalars(
        select(Reward.art_id).where(Reward.user_id == user_id).order_by(Reward.awarded_at)))

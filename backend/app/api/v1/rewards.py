import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.assets import art_brief
from app.core.db import get_session
from app.core.security import current_user_id
from app.models import ArtWork
from app.schemas.reward import PendingResponse, RevealResponse, RewardItem
from app.services import reward as reward_service

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/pending", response_model=PendingResponse)
async def pending(user_id: uuid.UUID = Depends(current_user_id),
                  session: AsyncSession = Depends(get_session)):
    dates = await reward_service.pending_dates(session, user_id, clock.now())
    return PendingResponse(revealable=bool(dates), ritual_dates=dates)


@router.post("/reveal", response_model=RevealResponse)
async def reveal(user_id: uuid.UUID = Depends(current_user_id),
                 session: AsyncSession = Depends(get_session)):
    created = await reward_service.RewardService().reveal_all(
        session, user_id, clock.now())
    items = []
    for reward, ritual_date in created:
        art = await session.get(ArtWork, reward.art_id)
        items.append(RewardItem(art=art_brief(art), ritual_date=ritual_date,
                                awarded_at=reward.awarded_at))
    return RevealResponse(rewards=items)

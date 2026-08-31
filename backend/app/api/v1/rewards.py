import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.assets import art_brief
from app.core.db import get_session
from app.core.security import current_user_id
from app.domain import ritual as domain
from app.models import ArtWork, UserSettings
from app.repositories import reward as reward_repo
from app.schemas.reward import PendingResponse, RevealResponse, RewardItem
from app.services.reward import RewardService

router = APIRouter(prefix="/rewards", tags=["rewards"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/pending", response_model=PendingResponse)
async def pending(user_id: uuid.UUID = Depends(current_user_id),
                  session: AsyncSession = Depends(get_session)):
    s: UserSettings = await session.get(UserSettings, user_id)
    now = _now()
    dates = [n.ritual_date for n in await reward_repo.pending_nights(session, user_id)
             if domain.can_reveal(ritual_date=n.ritual_date, is_eligible=n.is_eligible,
                                  reward_revealed_at=n.reward_revealed_at,
                                  now=now, tz=s.timezone)]
    return PendingResponse(revealable=bool(dates), ritual_dates=dates)


@router.post("/reveal", response_model=RevealResponse)
async def reveal(user_id: uuid.UUID = Depends(current_user_id),
                 session: AsyncSession = Depends(get_session)):
    created = await RewardService().reveal_all(session, user_id, _now())
    items = []
    for reward, ritual_date in created:
        art = await session.get(ArtWork, reward.art_id)
        items.append(RewardItem(art=art_brief(art), ritual_date=ritual_date,
                                awarded_at=reward.awarded_at))
    return RevealResponse(rewards=items)

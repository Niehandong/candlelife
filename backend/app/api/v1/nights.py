import uuid
from datetime import date as _date
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import DecryptError, decrypt_list, encrypt_list
from app.core.db import get_session
from app.core.security import current_user_id
from app.domain import ritual as domain
from app.domain.config import DEFAULT_CONFIG
from app.models import UserSettings
from app.repositories import night as night_repo
from app.schemas.night import (CompleteRequest, CompleteResponse, NightDetail, NightList,
                               NightSummary, RecordTextUpdate)
from app.services.ritual import RitualConfig, RitualService

router = APIRouter(prefix="/nights", tags=["nights"])


def _now() -> datetime:
    """独立函数便于测试注入。业务判定不得在 domain 层调用 now()。"""
    return datetime.now(timezone.utc)


def _ritual_config() -> RitualConfig:
    c = DEFAULT_CONFIG
    return RitualConfig(tolerance_minutes=c.ritual.tolerance_minutes,
                        min_time=c.schedule.min_time, max_time=c.schedule.max_time)


def _summary(r) -> NightSummary:
    return NightSummary(ritual_date=r.ritual_date, is_eligible=r.is_eligible,
                        late_minutes=r.late_minutes, completed_at=r.completed_at)


@router.post("/complete", response_model=CompleteResponse)
async def complete(body: CompleteRequest,
                   user_id: uuid.UUID = Depends(current_user_id),
                   session: AsyncSession = Depends(get_session)):
    record, streak = await RitualService().complete(session, user_id, body, _ritual_config())
    return CompleteResponse(ritual_date=record.ritual_date, is_eligible=record.is_eligible,
                            late_minutes=record.late_minutes, streak=streak)


@router.get("", response_model=NightList)
async def list_nights(start: _date | None = Query(None, alias="from"),
                      end: _date | None = Query(None, alias="to"),
                      user_id: uuid.UUID = Depends(current_user_id),
                      session: AsyncSession = Depends(get_session)):
    rows = await night_repo.list_range(session, user_id, start, end)
    return NightList(items=[_summary(r) for r in rows])


@router.get("/{ritual_date}", response_model=NightDetail)
async def get_night(ritual_date: _date,
                    user_id: uuid.UUID = Depends(current_user_id),
                    session: AsyncSession = Depends(get_session)):
    r = await night_repo.get(session, user_id, ritual_date)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NIGHT_NOT_FOUND")
    try:
        gratitudes, plans, ok = decrypt_list(r.gratitudes_enc), decrypt_list(r.plans_enc), True
    except DecryptError:
        # 降级：一条坏数据不该让整个夜记页打不开
        gratitudes, plans, ok = [], [], False
    return NightDetail(**_summary(r).model_dump(), gratitudes=gratitudes, plans=plans,
                       resistance_reason=r.resistance_reason, text_available=ok)


@router.patch("/{ritual_date}", response_model=NightDetail)
async def edit_night_text(ritual_date: _date, body: RecordTextUpdate,
                          user_id: uuid.UUID = Depends(current_user_id),
                          session: AsyncSession = Depends(get_session)):
    r = await night_repo.get(session, user_id, ritual_date)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NIGHT_NOT_FOUND")

    s: UserSettings = await session.get(UserSettings, user_id)
    if _now() >= domain.reveal_window_opens_at(ritual_date, s.timezone):
        raise HTTPException(status.HTTP_409_CONFLICT, "RECORD_LOCKED")

    # 只改正文；completed_at / is_eligible / late_minutes 一律不动
    r.gratitudes_enc = encrypt_list(body.gratitudes)
    r.plans_enc = encrypt_list(body.plans)
    await session.commit()
    return await get_night(ritual_date, user_id, session)

import uuid
from datetime import date as _date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.schemas.night import (CompleteRequest, CompleteResponse, NightDetail, NightList,
                               RecordTextUpdate)
from app.services import admin_config
from app.services import night as night_service
from app.services.ritual import RitualConfig, RitualService

router = APIRouter(prefix="/nights", tags=["nights"])


async def get_ritual_config(
    session: AsyncSession = Depends(get_session),
) -> RitualConfig:
    """按时判定用的参数，【查库】而不是用常量。

    这里原先写死 DEFAULT_CONFIG —— 于是阶段二交付的运营配置对「按时完成容差」
    这个最核心的判定完全无效：管理员在后台把容差从 30 改成 15，
    POST /nights/complete 仍按 30 判。同一个仓库里 GET /api/v1/config 是
    老老实实查库的，两条路径读的不是同一个来源。

    与「历史固化」不冲突：is_eligible / late_minutes 仍在发生当时写入数据库列，
    任何查询不得重算。这里改的只是【写入时用哪个容差】，
    运营调整依旧只影响此后的仪式夜。

    load_active_config 自带回落（库里没有行、或 JSON 坏了都回落 DEFAULT_CONFIG），
    所以这条路径不会因为配置表出问题而让用户完不成仪式。
    """
    c = await admin_config.load_active_config(session)
    return RitualConfig(tolerance_minutes=c.ritual.tolerance_minutes,
                        min_time=c.schedule.min_time, max_time=c.schedule.max_time)


@router.post("/complete", response_model=CompleteResponse)
async def complete(body: CompleteRequest,
                   user_id: uuid.UUID = Depends(current_user_id),
                   session: AsyncSession = Depends(get_session),
                   config: RitualConfig = Depends(get_ritual_config)):
    record, streak = await RitualService().complete(session, user_id, body, config)
    return CompleteResponse(ritual_date=record.ritual_date, is_eligible=record.is_eligible,
                            late_minutes=record.late_minutes, streak=streak)


@router.get("", response_model=NightList)
async def list_nights(start: _date | None = Query(None, alias="from"),
                      end: _date | None = Query(None, alias="to"),
                      user_id: uuid.UUID = Depends(current_user_id),
                      session: AsyncSession = Depends(get_session)):
    return await night_service.list_nights(session, user_id, start, end)


@router.get("/{ritual_date}", response_model=NightDetail)
async def get_night(ritual_date: _date,
                    user_id: uuid.UUID = Depends(current_user_id),
                    session: AsyncSession = Depends(get_session)):
    return await night_service.get_night(session, user_id, ritual_date)


@router.patch("/{ritual_date}", response_model=NightDetail)
async def edit_night_text(ritual_date: _date, body: RecordTextUpdate,
                          user_id: uuid.UUID = Depends(current_user_id),
                          session: AsyncSession = Depends(get_session)):
    return await night_service.edit_text(session, user_id, ritual_date, body)

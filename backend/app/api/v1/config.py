from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.schemas.config import AssetsPayload, ConfigResponse, RitualPayload, SchedulePayload
from app.services import admin_config

router = APIRouter(tags=["config"])


@router.get("/config", response_model=ConfigResponse)
async def get_config(session: AsyncSession = Depends(get_session)):
    """公开接口：小程序启动即需要，不要求登录。

    查 app_config 优先，查不到或解析失败回落 domain/config.py 的常量。
    对外形状与阶段一完全一致——小程序端不需要任何改动。
    """
    c = await admin_config.load_active_config(session)
    return ConfigResponse(
        schedule=SchedulePayload(bedtime=c.schedule.bedtime, wake_time=c.schedule.wake_time,
                                 min_time=c.schedule.min_time, max_time=c.schedule.max_time),
        ritual=RitualPayload(tolerance_minutes=c.ritual.tolerance_minutes,
                             gratitude_count=c.ritual.gratitude_count,
                             plan_count=c.ritual.plan_count,
                             resistance_options=list(c.ritual.resistance_options)),
        assets=AssetsPayload(base_url=get_settings().asset_base_url.rstrip("/")))

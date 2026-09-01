import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.schemas.event import EventBatch
from app.services import event as event_service

router = APIRouter(tags=["events"])


@router.post("/events")
async def ingest_events(body: EventBatch,
                        user_id: uuid.UUID = Depends(current_user_id),
                        session: AsyncSession = Depends(get_session)):
    """匿名行为事件上报。

    返回 200 + data:null —— 原先是 202 空体，现已归入「/api 下没有空体响应」。
    """
    await event_service.ingest(session, user_id, body)
    return None

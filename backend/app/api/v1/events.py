import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.models import AnalyticsEvent
from app.schemas.config import EventBatch

router = APIRouter(tags=["events"])


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_events(body: EventBatch,
                        user_id: uuid.UUID = Depends(current_user_id),
                        session: AsyncSession = Depends(get_session)):
    session.add_all([
        AnalyticsEvent(user_id=user_id, type=e.type, payload=e.payload, created_at=e.occurred_at)
        for e in body.events])
    await session.commit()
    return Response(status_code=status.HTTP_202_ACCEPTED)

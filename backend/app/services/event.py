"""匿名行为事件的入库。

从 api/v1/events.py 搬过来的 —— 那里是整个仓库里唯一一个路由直接
`session.add_all()` + `commit()` 的地方，既没有 service 也没有 repository。
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnalyticsEvent
from app.schemas.event import EventBatch


async def ingest(session: AsyncSession, user_id: uuid.UUID,
                 batch: EventBatch) -> None:
    """批量写入。

    created_at 用客户端上报的 occurred_at 而不是服务端当前时刻 ——
    离线补报时事件的真实发生时间才有分析价值。批量大小上限由
    schemas/event.py 的校验把守，这里不再重复检查。
    """
    session.add_all([
        AnalyticsEvent(user_id=user_id, type=e.type, payload=e.payload,
                       created_at=e.occurred_at)
        for e in batch.events])
    await session.commit()

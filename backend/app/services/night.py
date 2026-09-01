"""夜记的读取与正文编辑。

从 api/v1/nights.py 搬过来的 —— 那里原本在路由函数里直接做锁定判定、加密、
提交事务，还在一个路由函数结尾 `return await get_night(...)` 直接调另一个路由
函数。分层约定写的是「api/v1 只做出入参转换与依赖注入」，事务边界属于 service。
"""
import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.crypto import DecryptError, decrypt_list, encrypt_list
from app.core.errors import ApiError
from app.domain import ritual as domain
from app.models import NightRecord, UserSettings
from app.repositories import night as night_repo
from app.schemas.night import NightDetail, NightList, NightSummary, RecordTextUpdate


def _summary(record: NightRecord) -> NightSummary:
    return NightSummary(ritual_date=record.ritual_date, is_eligible=record.is_eligible,
                        late_minutes=record.late_minutes, completed_at=record.completed_at)


def _detail(record: NightRecord) -> NightDetail:
    """把一条夜记转成详情，正文解密失败时降级。

    一条坏数据不该让整个夜记页打不开 —— 正文降级成空列表并把 text_available
    置为 false，日期与资格这些元数据照常返回。前端据此显示「这条记录暂时读不出来」。
    """
    try:
        gratitudes, plans, readable = decrypt_list(record.gratitudes_enc), \
            decrypt_list(record.plans_enc), True
    except DecryptError:
        gratitudes, plans, readable = [], [], False
    return NightDetail(**_summary(record).model_dump(),
                       gratitudes=gratitudes, plans=plans,
                       resistance_reason=record.resistance_reason,
                       text_available=readable)


async def list_nights(session: AsyncSession, user_id: uuid.UUID,
                      start: date | None, end: date | None) -> NightList:
    """夜记列表。

    **只返回明文的日期与资格，不解密正文** —— 正文是加密字段，
    列表页解密 N 条既慢又没必要，详情页单条解密即可。
    """
    rows = await night_repo.list_range(session, user_id, start, end)
    return NightList(items=[_summary(r) for r in rows])


async def _require(session: AsyncSession, user_id: uuid.UUID,
                   ritual_date: date) -> NightRecord:
    record = await night_repo.get(session, user_id, ritual_date)
    if record is None:
        raise ApiError("NIGHT_NOT_FOUND")
    return record


async def get_night(session: AsyncSession, user_id: uuid.UUID,
                    ritual_date: date) -> NightDetail:
    return _detail(await _require(session, user_id, ritual_date))


async def edit_text(session: AsyncSession, user_id: uuid.UUID, ritual_date: date,
                    payload: RecordTextUpdate) -> NightDetail:
    """改夜记正文。揭晓窗口一开就锁死。

    **只改正文**：completed_at / is_eligible / late_minutes 一律不动 ——
    那三个字段在完成当时就已固化，事后编辑不得影响已经发生的判定，
    否则用户可以靠改文字把「没按时」改成「按时」。
    """
    record = await _require(session, user_id, ritual_date)

    settings: UserSettings = await session.get(UserSettings, user_id)
    if clock.now() >= domain.reveal_window_opens_at(ritual_date, settings.timezone):
        raise ApiError("RECORD_LOCKED")

    record.gratitudes_enc = encrypt_list(payload.gratitudes)
    record.plans_enc = encrypt_list(payload.plans)
    await session.commit()
    return _detail(record)

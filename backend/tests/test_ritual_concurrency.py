"""并发完成仪式的幂等性。

必须用真实的独立连接与独立事务——共享事务的 session fixture 无法暴露竞态。
正确性的最终防线是 UNIQUE(user_id, ritual_date)，不是应用层的 if-not-exists。
"""
import asyncio
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import NightRecord, User, UserSettings
from app.schemas.night import CompleteRequest
from app.services.ritual import RitualConfig, RitualService

PAYLOAD = {"completed_at": "2026-08-27T23:59:00+08:00", "gratitudes": ["并发"], "plans": []}


@pytest_asyncio.fixture(loop_scope="session")
async def real_user(engine):
    """真实提交的用户，测试结束后清理。"""
    maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    openid = f"concurrency_{uuid.uuid4().hex[:8]}"
    async with maker() as s:
        user = User(openid=openid)
        s.add(user)
        await s.flush()
        s.add(UserSettings(user_id=user.id))
        await s.commit()
        user_id = user.id
    yield user_id, maker
    async with maker() as s:
        await s.execute(delete(User).where(User.id == user_id))
        await s.commit()


async def test_concurrent_completion_creates_exactly_one_record(real_user):
    user_id, maker = real_user

    async def once():
        async with maker() as s:
            try:
                return await RitualService().complete(
                    s, user_id, CompleteRequest(**PAYLOAD), RitualConfig())
            except Exception as exc:          # 竞态下允许其一失败，但不得写出两条
                return exc

    results = await asyncio.gather(*(once() for _ in range(5)), return_exceptions=True)

    async with maker() as s:
        count = await s.scalar(
            select(func.count()).select_from(NightRecord).where(NightRecord.user_id == user_id))
    assert count == 1, f"并发下写出了 {count} 条夜记，唯一约束失效"

    ok = [r for r in results if not isinstance(r, BaseException)]
    assert ok, "全部请求都失败了，幂等应至少让一个成功"
    ritual_dates = {r[0].ritual_date for r in ok}
    assert len(ritual_dates) == 1


async def test_sequential_repeat_never_duplicates(real_user):
    user_id, maker = real_user
    for _ in range(3):
        async with maker() as s:
            await RitualService().complete(
                s, user_id, CompleteRequest(**PAYLOAD), RitualConfig())
    async with maker() as s:
        count = await s.scalar(
            select(func.count()).select_from(NightRecord).where(NightRecord.user_id == user_id))
    assert count == 1

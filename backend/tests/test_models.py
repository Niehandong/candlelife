from datetime import date, datetime, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import ArtWork, NightRecord, Reward, User


async def _user(session, openid="o1"):
    u = User(openid=openid)
    session.add(u)
    await session.flush()
    return u


def _night(user_id, ritual_date):
    return NightRecord(
        user_id=user_id, ritual_date=ritual_date,
        planned_at=datetime(2026, 8, 27, 15, 30, tzinfo=timezone.utc),
        completed_at=datetime(2026, 8, 27, 15, 59, tzinfo=timezone.utc),
        late_minutes=29, is_eligible=True,
    )


def _art(art_id="monet"):
    return ArtWork(id=art_id, title="睡莲", artist="莫奈", year="1916",
                   thumbnail="art/t.jpg", image="art/i.jpg", alt="alt",
                   source="公共领域", article="文章")


async def test_one_night_record_per_ritual_date(session):
    """同一用户同一仪式夜只能有一条夜记——幂等的根。"""
    u = await _user(session)
    session.add(_night(u.id, date(2026, 8, 27)))
    await session.flush()
    session.add(_night(u.id, date(2026, 8, 27)))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_different_users_share_ritual_date(session):
    a, b = await _user(session, "ua"), await _user(session, "ub")
    session.add_all([_night(a.id, date(2026, 8, 27)), _night(b.id, date(2026, 8, 27))])
    await session.flush()
    assert await session.scalar(select(func.count()).select_from(NightRecord)) == 2


async def test_art_work_rejects_blank_required_field(session):
    art = _art("blank")
    art.title = "   "
    session.add(art)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_user_settings_defaults(session):
    from app.models import UserSettings
    u = await _user(session, "defaults")
    session.add(UserSettings(user_id=u.id))
    await session.flush()
    s = await session.get(UserSettings, u.id)
    assert str(s.bedtime) == "23:30:00"
    assert s.timezone == "Asia/Shanghai"
    assert s.reduced_motion is False


async def test_collected_art_cannot_be_deleted(session):
    """被收藏过的作品不可物理删除，只能下架或撤回。"""
    u = await _user(session, "collector")
    night, art = _night(u.id, date(2026, 8, 27)), _art("keep")
    session.add_all([night, art])
    await session.flush()
    session.add(Reward(user_id=u.id, night_record_id=night.id, art_id=art.id))
    await session.flush()

    await session.delete(art)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_duplicate_rewards_allowed(session):
    """抽卡允许重复抽中同一幅，不得有唯一约束阻止。"""
    u = await _user(session, "dup")
    night, art = _night(u.id, date(2026, 8, 27)), _art("dup-art")
    session.add_all([night, art])
    await session.flush()
    session.add_all([
        Reward(user_id=u.id, night_record_id=night.id, art_id=art.id),
        Reward(user_id=u.id, night_record_id=night.id, art_id=art.id),
    ])
    await session.flush()
    assert await session.scalar(select(func.count()).select_from(Reward)) == 2


async def test_deleting_user_cascades_all_data(session):
    """注销即物理删除全部数据。"""
    from app.models import AnalyticsEvent, UserSettings
    u = await _user(session, "to-delete")
    night, art = _night(u.id, date(2026, 8, 27)), _art("cascade-art")
    session.add_all([night, art, UserSettings(user_id=u.id)])
    await session.flush()
    session.add_all([
        Reward(user_id=u.id, night_record_id=night.id, art_id=art.id),
        AnalyticsEvent(user_id=u.id, type="t", payload={},
                       created_at=datetime(2026, 8, 27, tzinfo=timezone.utc)),
    ])
    await session.flush()

    await session.delete(u)
    await session.flush()

    for model in (NightRecord, Reward, AnalyticsEvent, UserSettings):
        col = model.user_id
        assert await session.scalar(
            select(func.count()).select_from(model).where(col == u.id)) == 0, model.__name__
    # 作品本身不随用户删除
    assert await session.get(ArtWork, "cascade-art") is not None

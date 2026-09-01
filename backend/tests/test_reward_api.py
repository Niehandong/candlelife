from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models import ArtWork, NightRecord, Reward, User
from tests.conftest import body

SH = timezone(timedelta(hours=8))


def _freeze(monkeypatch, iso: str):
    monkeypatch.setattr("app.core.clock.now", lambda: datetime.fromisoformat(iso))


async def _uid(session):
    return (await session.scalar(
        select(User).where(User.openid == "mock_openid_test-user"))).id


async def _seed_art(session, n=3):
    for i in range(n):
        session.add(ArtWork(
            id=f"art-{i}", title=f"作品{i}", artist="佚名", year="2026",
            thumbnail=f"art/{i}-thumb.jpg", image=f"art/{i}.jpg",
            alt=f"作品{i}", source="公共领域", article="文章正文"))
    await session.flush()


async def _seed_nights(session, user_id, days, eligible=True):
    for d in days:
        session.add(NightRecord(
            user_id=user_id, ritual_date=date.fromisoformat(d),
            planned_at=datetime.fromisoformat(f"{d}T23:30:00+08:00"),
            completed_at=datetime.fromisoformat(f"{d}T23:45:00+08:00"),
            late_minutes=15, is_eligible=eligible))
    await session.flush()


@pytest.fixture
async def ctx(auth_client, session):
    await _seed_art(session)
    return auth_client, session, await _uid(session)


async def test_pending_empty_before_window(ctx, monkeypatch):
    c, session, uid = ctx
    await _seed_nights(session, uid, ["2026-08-27"])
    _freeze(monkeypatch, "2026-08-28T05:59:00+08:00")
    assert body(await c.get("/api/v1/rewards/pending"))["revealable"] is False


async def test_pending_opens_at_six(ctx, monkeypatch):
    c, session, uid = ctx
    await _seed_nights(session, uid, ["2026-08-27"])
    _freeze(monkeypatch, "2026-08-28T06:00:00+08:00")
    payload = body(await c.get("/api/v1/rewards/pending"))
    assert payload["revealable"] is True and payload["ritual_dates"] == ["2026-08-27"]


async def test_reveal_creates_rewards_and_is_idempotent(ctx, monkeypatch):
    c, session, uid = ctx
    await _seed_nights(session, uid, ["2026-08-27"])
    _freeze(monkeypatch, "2026-08-28T07:00:00+08:00")

    first = body(await c.post("/api/v1/rewards/reveal"))["rewards"]
    assert len(first) == 1
    second = body(await c.post("/api/v1/rewards/reveal"))["rewards"]
    assert second == []                                    # 不重抽
    assert await session.scalar(select(func.count()).select_from(Reward)) == 1


async def test_reveal_multiple_pending_nights(ctx, monkeypatch):
    """用户数日未打开，一次揭晓全部。3 晚连续：1+1+2（第3晚里程碑）= 4 抽。"""
    c, session, uid = ctx
    await _seed_nights(session, uid, ["2026-08-25", "2026-08-26", "2026-08-27"])
    _freeze(monkeypatch, "2026-08-29T09:00:00+08:00")
    rewards = body(await c.post("/api/v1/rewards/reveal"))["rewards"]
    assert len(rewards) == 4
    assert {r["ritual_date"] for r in rewards} == {"2026-08-25", "2026-08-26", "2026-08-27"}


async def test_draw_count_uses_streak_at_that_night(ctx, monkeypatch):
    """★ 断签后补揭晓，抽数仍按该仪式夜当时的连续天数。"""
    c, session, uid = ctx
    # 08-21..08-27 连续 7 晚，08-28 缺席，08-29 才打开
    await _seed_nights(session, uid, [f"2026-08-{d}" for d in range(21, 28)])
    _freeze(monkeypatch, "2026-08-29T09:00:00+08:00")
    rewards = body(await c.post("/api/v1/rewards/reveal"))["rewards"]
    # 7 晚：第 3 晚 +1、第 7 晚 +1，其余各 1 → 7 + 2 = 9
    assert len(rewards) == 9

    row = await session.scalar(
        select(NightRecord).where(NightRecord.user_id == uid,
                                  NightRecord.ritual_date == date(2026, 8, 27)))
    assert row.reward_draw_count == 2      # 而非按揭晓时刻（已断签）算出的 1


async def test_ineligible_night_gets_no_reward(ctx, monkeypatch):
    c, session, uid = ctx
    await _seed_nights(session, uid, ["2026-08-27"], eligible=False)
    _freeze(monkeypatch, "2026-08-29T09:00:00+08:00")
    assert body(await c.post("/api/v1/rewards/reveal"))["rewards"] == []


async def test_withdrawn_art_excluded_from_pool(ctx, monkeypatch):
    c, session, uid = ctx
    for row in (await session.scalars(select(ArtWork))).all():
        row.is_withdrawn = True
    await session.flush()
    await _seed_nights(session, uid, ["2026-08-27"])
    _freeze(monkeypatch, "2026-08-29T09:00:00+08:00")
    assert body(await c.post("/api/v1/rewards/reveal"))["rewards"] == []


async def test_deactivated_art_excluded_from_pool(ctx, monkeypatch, session):
    c, session, uid = ctx
    rows = (await session.scalars(select(ArtWork))).all()
    for row in rows[1:]:
        row.is_active = False
    await session.flush()
    await _seed_nights(session, uid, ["2026-08-27"])
    _freeze(monkeypatch, "2026-08-29T09:00:00+08:00")
    rewards = body(await c.post("/api/v1/rewards/reveal"))["rewards"]
    assert len(rewards) == 1
    assert rewards[0]["art"]["id"] == rows[0].id      # 只可能抽到唯一上架的那幅


async def test_asset_url_is_absolute(ctx, monkeypatch):
    c, session, uid = ctx
    await _seed_nights(session, uid, ["2026-08-27"])
    _freeze(monkeypatch, "2026-08-28T07:00:00+08:00")
    art = body(await c.post("/api/v1/rewards/reveal"))["rewards"][0]["art"]
    assert art["image"].startswith("http") and art["image"].endswith(".jpg")

from datetime import date, datetime, timezone

import pytest
from sqlalchemy import select

from app.models import ArtWork, NightRecord, Reward, User


@pytest.fixture
async def ctx(auth_client, session):
    user = await session.scalar(select(User).where(User.openid == "mock_openid_test-user"))
    session.add_all([
        ArtWork(id="a", title="作品A", artist="佚名", year="2026", thumbnail="art/a-t.jpg",
                image="art/a.jpg", alt="A", source="公共领域", article="文章 A"),
        ArtWork(id="b", title="作品B", artist="佚名", year="2026", thumbnail="art/b-t.jpg",
                image="art/b.jpg", alt="B", source="公共领域", article="文章 B"),
    ])
    night = NightRecord(
        user_id=user.id, ritual_date=date(2026, 8, 27),
        planned_at=datetime(2026, 8, 27, 15, 30, tzinfo=timezone.utc),
        completed_at=datetime(2026, 8, 27, 15, 45, tzinfo=timezone.utc),
        late_minutes=15, is_eligible=True)
    session.add(night)
    await session.flush()
    session.add_all([
        Reward(user_id=user.id, night_record_id=night.id, art_id="a"),
        Reward(user_id=user.id, night_record_id=night.id, art_id="a"),
        Reward(user_id=user.id, night_record_id=night.id, art_id="b"),
    ])
    await session.flush()
    return auth_client, session


async def test_collection_counts_cards_and_unique_works(ctx):
    c, _ = ctx
    body = (await c.get("/api/v1/collection")).json()
    assert body["total_cards"] == 3          # 含重复
    assert body["unique_works"] == 2         # 去重
    assert {i["art"]["id"]: i["count"] for i in body["items"]} == {"a": 2, "b": 1}


async def test_empty_collection(auth_client):
    body = (await auth_client.get("/api/v1/collection")).json()
    assert body == {"total_cards": 0, "unique_works": 0, "items": []}


async def test_asset_urls_are_absolute(ctx):
    c, _ = ctx
    body = (await c.get("/api/v1/collection")).json()
    for item in body["items"]:
        assert item["art"]["thumbnail"].startswith("http")
        assert item["art"]["image"].startswith("http")


async def test_deactivated_art_still_visible_in_collection(ctx):
    """下架只影响抽卡池，已收藏仍可见可读。"""
    c, session = ctx
    (await session.get(ArtWork, "a")).is_active = False
    await session.flush()
    body = (await c.get("/api/v1/collection")).json()
    assert body["unique_works"] == 2
    assert "a" in {i["art"]["id"] for i in body["items"]}
    assert (await c.get("/api/v1/art/a")).status_code == 200


async def test_withdrawn_art_is_gone(ctx):
    """撤回后连已收藏用户也不可见。"""
    c, session = ctx
    (await session.get(ArtWork, "a")).is_withdrawn = True
    await session.flush()
    assert (await c.get("/api/v1/art/a")).status_code == 410
    body = (await c.get("/api/v1/collection")).json()
    # 统计反映用户实际获得过什么，展示则受撤回约束
    assert body["total_cards"] == 3 and body["unique_works"] == 2
    assert "a" not in {i["art"]["id"] for i in body["items"]}


async def test_art_detail_includes_article_and_source(ctx):
    c, _ = ctx
    body = (await c.get("/api/v1/art/b")).json()
    assert body["article"] == "文章 B"
    assert body["source"] == "公共领域"
    assert body["title"] == "作品B"


async def test_unknown_art_returns_404(ctx):
    c, _ = ctx
    assert (await c.get("/api/v1/art/nope")).status_code == 404


async def test_collection_requires_auth(client):
    assert (await client.get("/api/v1/collection")).status_code == 401

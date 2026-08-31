from sqlalchemy import select

from app.models import AnalyticsEvent


async def test_batch_events_stored(auth_client, session):
    r = await auth_client.post("/api/v1/events", json={"events": [
        {"type": "ritual_completed", "payload": {"eligible": True},
         "occurred_at": "2026-08-27T23:59:00+08:00"},
        {"type": "reward_revealed", "payload": {"draws": 2},
         "occurred_at": "2026-08-28T07:00:00+08:00"}]})
    assert r.status_code == 202
    rows = (await session.scalars(select(AnalyticsEvent))).all()
    assert {row.type for row in rows} == {"ritual_completed", "reward_revealed"}
    assert any(row.payload == {"draws": 2} for row in rows)


async def test_payload_with_forbidden_keys_is_rejected(auth_client, session):
    """正文绝不可进入匿名事件（spec 第八节）。"""
    for bad in ("gratitudes", "plans", "openid", "nickname", "access_token"):
        r = await auth_client.post("/api/v1/events", json={"events": [
            {"type": "t", "payload": {bad: "不该出现"},
             "occurred_at": "2026-08-27T23:59:00+08:00"}]})
        assert r.status_code == 422, bad
        assert r.json()["code"] == "VALIDATION_ERROR"
    assert (await session.scalars(select(AnalyticsEvent))).all() == []


async def test_batch_size_capped(auth_client):
    events = [{"type": "t", "payload": {}, "occurred_at": "2026-08-27T23:59:00+08:00"}] * 201
    assert (await auth_client.post("/api/v1/events", json={"events": events})).status_code == 422


async def test_empty_batch_rejected(auth_client):
    assert (await auth_client.post("/api/v1/events", json={"events": []})).status_code == 422


async def test_events_require_auth(client):
    r = await client.post("/api/v1/events", json={"events": [
        {"type": "t", "payload": {}, "occurred_at": "2026-08-27T23:59:00+08:00"}]})
    assert r.status_code == 401

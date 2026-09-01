from datetime import date, datetime, timezone

from sqlalchemy import func, select

from app.core import codes
from app.models import NightRecord, User
from tests.conftest import body, err, failed


async def test_get_me_returns_defaults(auth_client):
    payload = body(await auth_client.get("/api/v1/me"))
    assert payload["settings"]["timezone"] == "Asia/Shanghai"
    assert payload["settings"]["bedtime"] == "23:30"
    assert payload["settings"]["wake_time"] == "07:30"
    assert payload["nickname"] is None


async def test_update_settings(auth_client):
    r = await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "00:30", "wake_time": "08:00",
        "timezone": "America/New_York", "reduced_motion": True})
    assert r.status_code == 200
    assert body(r)["timezone"] == "America/New_York"
    assert body(r)["bedtime"] == "00:30"
    again = body(await auth_client.get("/api/v1/me"))["settings"]
    assert again["bedtime"] == "00:30" and again["reduced_motion"] is True


async def test_reject_invalid_timezone(auth_client):
    r = await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "23:30", "wake_time": "07:30",
        "timezone": "Mars/Olympus", "reduced_motion": False})
    failed(r, codes.UNPROCESSABLE)


async def test_update_nickname_passes_content_check(auth_client):
    r = await auth_client.patch("/api/v1/me", json={"nickname": "夜行人"})
    assert r.status_code == 200 and body(r)["nickname"] == "夜行人"


async def test_nickname_rejected_when_content_check_fails(auth_client, monkeypatch):
    """微信侧检测不通过（或故障）时必须拒绝保存，不得放行。"""
    from app.services.wechat import WeChatClient
    monkeypatch.setattr(WeChatClient, "check_text", lambda self, text: _false())
    r = await auth_client.patch("/api/v1/me", json={"nickname": "违规昵称"})
    failed(r, codes.NICKNAME_REJECTED)


async def _false():
    return False


async def test_requires_auth(client):
    failed(await client.get("/api/v1/me"), codes.TOKEN_MISSING)


async def test_delete_account_removes_all_data(auth_client, session):
    user = await session.scalar(select(User).where(User.openid == "mock_openid_test-user"))
    session.add(NightRecord(
        user_id=user.id, ritual_date=date(2026, 8, 27),
        planned_at=datetime(2026, 8, 27, 15, 30, tzinfo=timezone.utc),
        completed_at=datetime(2026, 8, 27, 15, 59, tzinfo=timezone.utc),
        late_minutes=29, is_eligible=True))
    await session.flush()

    assert body(await auth_client.delete("/api/v1/me")) is None
    assert await session.scalar(
        select(func.count()).select_from(User).where(User.id == user.id)) == 0
    assert await session.scalar(
        select(func.count()).select_from(NightRecord).where(NightRecord.user_id == user.id)) == 0

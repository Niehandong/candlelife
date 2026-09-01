from sqlalchemy import func, select

from tests.conftest import body, failed
from app.core import codes
from app.models import NightRecord


async def test_complete_on_time(auth_client):
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:59:00+08:00",
        "gratitudes": ["感谢今天的阳光"], "plans": ["早点起"]})
    assert r.status_code == 200
    assert body(r) == {"ritual_date": "2026-08-27", "is_eligible": True,
                        "late_minutes": 29, "streak": 1}


async def test_complete_outside_window_still_creates_record(auth_client, session):
    """窗口外完成仍产生夜记，只是不合格（spec 修正 3）。"""
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T17:30:00+08:00", "gratitudes": [], "plans": []})
    assert r.status_code == 200
    payload = body(r)
    assert payload["is_eligible"] is False and payload["streak"] == 0
    assert await session.scalar(select(func.count()).select_from(NightRecord)) == 1


async def test_late_beyond_tolerance_not_eligible(auth_client):
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-28T00:01:00+08:00", "gratitudes": [], "plans": []})
    payload = body(r)
    assert payload["ritual_date"] == "2026-08-27"
    assert payload["late_minutes"] == 31 and payload["is_eligible"] is False


async def test_repeat_completion_is_idempotent(auth_client, session):
    payload = {"completed_at": "2026-08-27T23:59:00+08:00",
               "gratitudes": ["第一次"], "plans": []}
    first = body(await auth_client.post("/api/v1/nights/complete", json=payload))
    payload["gratitudes"] = ["第二次"]
    second = body(await auth_client.post("/api/v1/nights/complete", json=payload))

    assert first == second                        # 200 + 既有数据，不是 409
    assert await session.scalar(select(func.count()).select_from(NightRecord)) == 1
    # 首次写入的正文不被第二次覆盖
    detail = body(await auth_client.get("/api/v1/nights/2026-08-27"))
    assert detail["gratitudes"] == ["第一次"]


async def test_client_cannot_forge_eligibility(auth_client):
    """请求体带判定字段直接 422——拒绝比静默忽略安全。"""
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T17:30:00+08:00", "gratitudes": [], "plans": [],
        "is_eligible": True, "late_minutes": 0, "streak": 99})
    failed(r, codes.UNPROCESSABLE)


async def test_text_is_encrypted_at_rest(auth_client, session):
    secret = "这句话不能明文出现在库里"
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:59:00+08:00", "gratitudes": [secret], "plans": []})
    row = await session.scalar(select(NightRecord))
    assert row.gratitudes_enc is not None
    assert secret.encode() not in bytes(row.gratitudes_enc)


async def test_timezone_is_respected(auth_client):
    """改成纽约时区后，同一 UTC 时刻的判定随之改变。"""
    await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "23:30", "wake_time": "07:30",
        "timezone": "America/New_York", "reduced_motion": False})
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:45:00-04:00", "gratitudes": [], "plans": []})
    assert body(r) == {"ritual_date": "2026-08-27", "is_eligible": True,
                        "late_minutes": 15, "streak": 1}


async def test_streak_accumulates(auth_client):
    for day, expected in [("25", 1), ("26", 2), ("27", 3)]:
        r = await auth_client.post("/api/v1/nights/complete", json={
            "completed_at": f"2026-08-{day}T23:40:00+08:00", "gratitudes": [], "plans": []})
        assert body(r)["streak"] == expected, day

from datetime import datetime

import pytest

from app.core import codes
from app.models import NightRecord
from tests.conftest import body, failed


@pytest.fixture
async def seeded(auth_client):
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:59:00+08:00",
        "gratitudes": ["原始内容"], "plans": ["原始计划"]})
    return auth_client


def _freeze(monkeypatch, iso: str):
    monkeypatch.setattr("app.core.clock.now", lambda: datetime.fromisoformat(iso))


async def test_detail_decrypts_text(seeded):
    payload = body(await seeded.get("/api/v1/nights/2026-08-27"))
    assert payload["gratitudes"] == ["原始内容"]
    assert payload["plans"] == ["原始计划"]
    assert payload["text_available"] is True


async def test_list_excludes_text(seeded):
    items = body(await seeded.get("/api/v1/nights"))["items"]
    assert len(items) == 1
    assert "gratitudes" not in items[0] and "plans" not in items[0]
    assert items[0]["ritual_date"] == "2026-08-27"


async def test_missing_night_returns_404(seeded):
    failed(await seeded.get("/api/v1/nights/2026-01-01"), codes.NIGHT_NOT_FOUND)


async def test_edit_before_reveal_window(seeded, monkeypatch):
    """仪式夜次日 06:00 之前可改（spec 修正 7）。"""
    _freeze(monkeypatch, "2026-08-28T05:59:00+08:00")
    r = await seeded.patch("/api/v1/nights/2026-08-27",
                           json={"gratitudes": ["改过的"], "plans": ["新计划"]})
    assert r.status_code == 200
    assert body(await seeded.get("/api/v1/nights/2026-08-27"))["gratitudes"] == ["改过的"]


async def test_edit_at_reveal_window_rejected(seeded, monkeypatch):
    _freeze(monkeypatch, "2026-08-28T06:00:00+08:00")
    r = await seeded.patch("/api/v1/nights/2026-08-27",
                           json={"gratitudes": ["太晚了"], "plans": []})
    failed(r, codes.RECORD_LOCKED)


async def test_edit_does_not_change_eligibility(seeded, monkeypatch, session):
    from sqlalchemy import select
    _freeze(monkeypatch, "2026-08-28T05:00:00+08:00")
    before = await session.scalar(select(NightRecord))
    completed_before, eligible_before = before.completed_at, before.is_eligible
    late_before = before.late_minutes

    await seeded.patch("/api/v1/nights/2026-08-27",
                       json={"gratitudes": ["改了正文"], "plans": []})
    await session.refresh(before)
    assert before.completed_at == completed_before
    assert before.is_eligible == eligible_before
    assert before.late_minutes == late_before

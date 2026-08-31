"""服务器时区不得影响判定结果——原型的核心缺陷（spec 修正 6）。

原实现用系统本地时间，同一输入在 UTC 容器下会判定为不合格。
"""
import time as _time
from datetime import date, datetime, time

import pytest

from app.domain import ritual

SERVER_TZS = ["UTC", "Asia/Shanghai", "America/New_York", "Pacific/Kiritimati"]


@pytest.fixture
def server_tz(request, monkeypatch):
    monkeypatch.setenv("TZ", request.param)
    if hasattr(_time, "tzset"):
        _time.tzset()
    yield request.param
    monkeypatch.undo()
    if hasattr(_time, "tzset"):
        _time.tzset()


@pytest.mark.parametrize("server_tz", SERVER_TZS, indirect=True)
def test_evaluate_completion_independent_of_server_tz(server_tz):
    got = ritual.evaluate_completion(
        planned_time=time(23, 30),
        completed_at=datetime.fromisoformat("2026-08-27T23:59:00+08:00"),
        tz="Asia/Shanghai", tolerance_minutes=30,
        min_time=time(20, 0), max_time=time(2, 0),
    )
    assert got.ritual_date == date(2026, 8, 27)
    assert got.late_minutes == 29
    assert got.eligible is True


@pytest.mark.parametrize("server_tz", SERVER_TZS, indirect=True)
def test_current_ritual_night_independent_of_server_tz(server_tz):
    assert ritual.current_ritual_night(
        datetime.fromisoformat("2026-08-28T02:00:00+08:00"), "Asia/Shanghai") == date(2026, 8, 27)


@pytest.mark.parametrize("server_tz", SERVER_TZS, indirect=True)
def test_reveal_window_independent_of_server_tz(server_tz):
    assert ritual.can_reveal(
        ritual_date=date(2026, 8, 27), is_eligible=True, reward_revealed_at=None,
        now=datetime.fromisoformat("2026-08-28T06:00:00+08:00"), tz="Asia/Shanghai") is True
    assert ritual.can_reveal(
        ritual_date=date(2026, 8, 27), is_eligible=True, reward_revealed_at=None,
        now=datetime.fromisoformat("2026-08-28T05:59:00+08:00"), tz="Asia/Shanghai") is False


def test_dst_transition_is_handled():
    """美国 3 月 8 日 DST 切换当晚，判定不得错乱。"""
    got = ritual.evaluate_completion(
        planned_time=time(23, 30),
        completed_at=datetime.fromisoformat("2026-03-07T23:40:00-05:00"),
        tz="America/New_York", tolerance_minutes=30,
        min_time=time(20, 0), max_time=time(2, 0),
    )
    assert got.ritual_date == date(2026, 3, 7)
    assert got.eligible is True

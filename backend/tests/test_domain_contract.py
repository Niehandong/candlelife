import json
from datetime import date, datetime, time
from pathlib import Path

import pytest

from app.domain import ritual

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "ritual-cases.json").read_text("utf-8")
)


def _time(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


@pytest.mark.parametrize("case", CASES["evaluate_completion"], ids=lambda c: c["name"])
def test_evaluate_completion(case):
    i, o = case["in"], case["out"]
    got = ritual.evaluate_completion(
        planned_time=_time(i["planned_time"]),
        completed_at=datetime.fromisoformat(i["completed_at"]),
        tz=i["tz"],
        tolerance_minutes=i["tolerance_minutes"],
        min_time=_time(i["min_time"]),
        max_time=_time(i["max_time"]),
    )
    assert got.ritual_date == date.fromisoformat(o["ritual_date"])
    assert got.late_minutes == o["late_minutes"]
    assert got.eligible == o["eligible"]


@pytest.mark.parametrize("case", CASES["current_ritual_night"], ids=lambda c: c["name"])
def test_current_ritual_night(case):
    got = ritual.current_ritual_night(datetime.fromisoformat(case["in"]["now"]), case["in"]["tz"])
    assert got == date.fromisoformat(case["out"])


@pytest.mark.parametrize("case", CASES["calculate_on_time_streak"], ids=lambda c: c["name"])
def test_calculate_on_time_streak(case):
    i = case["in"]
    records = [(date.fromisoformat(d), e) for d, e in i["records"]]
    assert ritual.calculate_on_time_streak(
        records, date.fromisoformat(i["current_night"])) == case["out"]


@pytest.mark.parametrize("case", CASES["reward_draw_count"], ids=lambda c: str(c["in"]["streak"]))
def test_reward_draw_count(case):
    assert ritual.reward_draw_count(case["in"]["streak"]) == case["out"]


@pytest.mark.parametrize("case", CASES["can_reveal"], ids=lambda c: c["name"])
def test_can_reveal(case):
    i = case["in"]
    revealed = i["reward_revealed_at"]
    assert ritual.can_reveal(
        ritual_date=date.fromisoformat(i["ritual_date"]),
        is_eligible=i["is_eligible"],
        reward_revealed_at=datetime.fromisoformat(revealed) if revealed else None,
        now=datetime.fromisoformat(i["now"]),
        tz=i["tz"],
    ) == case["out"]


@pytest.mark.parametrize("case", CASES["summarize_collection"], ids=lambda c: str(c["in"]))
def test_summarize_collection(case):
    got, o = ritual.summarize_collection(case["in"]["art_ids"]), case["out"]
    assert got.total_cards == o["total_cards"]
    assert got.unique_works == o["unique_works"]
    assert got.counts == o["counts"]

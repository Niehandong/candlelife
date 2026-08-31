"""烛生的业务规则。纯函数，零 IO。

对应 prototype/zhusheng-core.js，但修正了其中 7 处缺陷，详见
docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md。

本模块的行为由 shared/ritual-cases.json 契约锁定，小程序的 TS 实现读同一份用例。

硬约束：不导入 SQLAlchemy/Redis/httpx，不读环境变量，不调用 now()/today()，
不读系统本地时区——当前时刻与时区一律由调用方显式传入。
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

RITUAL_NIGHT_BOUNDARY_HOUR = 6   # 凌晨 6 点前归属前一晚
REVEAL_HOUR = 6                  # 揭晓窗口在仪式夜次日 6 点开启


@dataclass(frozen=True)
class CompletionAssessment:
    ritual_date: date
    planned_at: datetime
    completed_at: datetime
    late_minutes: int
    eligible: bool


@dataclass(frozen=True)
class CollectionSummary:
    total_cards: int
    unique_works: int
    counts: dict[str, int]


def current_ritual_night(now: datetime, tz: str) -> date:
    """此刻所处的仪式夜。凌晨 6 点前算前一晚。"""
    local = now.astimezone(ZoneInfo(tz))
    return (local - timedelta(hours=RITUAL_NIGHT_BOUNDARY_HOUR)).date()


def _in_eligibility_window(t: time, min_time: time, max_time: time) -> bool:
    """资格窗口可跨午夜（如 20:00–02:00）。"""
    if min_time <= max_time:
        return min_time <= t <= max_time
    return t >= min_time or t <= max_time


def _resolve_planned_at(completed_local: datetime, planned_time: time, zone: ZoneInfo) -> datetime:
    """在前一天/当天/次日三个候选中，取距完成时刻最近的计划时刻。"""
    candidates = [
        datetime.combine(completed_local.date() + timedelta(days=offset), planned_time, tzinfo=zone)
        for offset in (-1, 0, 1)
    ]
    return min(candidates, key=lambda c: abs(c - completed_local))


def evaluate_completion(
    *,
    planned_time: time,
    completed_at: datetime,
    tz: str,
    tolerance_minutes: int,
    min_time: time,
    max_time: time,
) -> CompletionAssessment:
    zone = ZoneInfo(tz)
    completed_local = completed_at.astimezone(zone)
    planned_at = _resolve_planned_at(completed_local, planned_time, zone)

    delta_minutes = int((completed_local - planned_at).total_seconds() // 60)
    late_minutes = max(0, delta_minutes)

    # 仪式夜由计划时刻归属：凌晨 6 点前的计划属于前一晚
    anchor = (planned_at - timedelta(days=1)
              if planned_at.hour < RITUAL_NIGHT_BOUNDARY_HOUR else planned_at)

    eligible = (
        _in_eligibility_window(completed_local.time(), min_time, max_time)
        and delta_minutes <= tolerance_minutes
    )

    return CompletionAssessment(
        ritual_date=anchor.date(),
        planned_at=planned_at,
        completed_at=completed_local,
        late_minutes=late_minutes,
        eligible=eligible,
    )


def calculate_on_time_streak(records: Sequence[tuple[date, bool]], current_night: date) -> int:
    """截至 current_night 的连续按时夜数。

    最近一条夜记若早于「当前仪式夜 − 1 天」，说明中间已有整夜缺席，归零。
    """
    by_date = dict(records)
    if not by_date:
        return 0

    latest = max(by_date)
    if latest < current_night - timedelta(days=1):
        return 0
    if not by_date[latest]:
        return 0

    streak = 1
    cursor = latest
    while by_date.get(cursor - timedelta(days=1)):
        streak += 1
        cursor -= timedelta(days=1)
    return streak


BASE_DOUBLE_STREAK = 14   # 连续满此天数后基础抽数升为 2


def reward_draw_count(streak: int) -> int:
    """抽卡次数。基础 1 抽，连续满 14 晚后基础 2 抽；里程碑额外 +1。

    设计意图：让「连续」优于「中断重来」。门槛定在 14 而非 30，
    是因为定在 30 时前 37 晚故意断签仍更划算（实测交叉点第 38 晚）；
    降到 14 后交叉点提前至第 16 晚，反向激励基本消除。
    """
    base = 2 if streak >= BASE_DOUBLE_STREAK else 1
    is_milestone = streak in (3, 7, 14) or (streak >= 30 and streak % 30 == 0)
    return base + (1 if is_milestone else 0)


def reveal_window_opens_at(ritual_date: date, tz: str) -> datetime:
    """揭晓窗口开启时刻：仪式夜次日 06:00（用户时区）。"""
    return datetime.combine(
        ritual_date + timedelta(days=1), time(REVEAL_HOUR, 0), tzinfo=ZoneInfo(tz)
    )


def can_reveal(
    *,
    ritual_date: date,
    is_eligible: bool,
    reward_revealed_at: datetime | None,
    now: datetime,
    tz: str,
) -> bool:
    if not is_eligible or reward_revealed_at is not None:
        return False
    return now.astimezone(ZoneInfo(tz)) >= reveal_window_opens_at(ritual_date, tz)


def summarize_collection(art_ids: Sequence[str]) -> CollectionSummary:
    counts: dict[str, int] = {}
    for art_id in art_ids:
        counts[art_id] = counts.get(art_id, 0) + 1
    return CollectionSummary(
        total_cards=sum(counts.values()), unique_works=len(counts), counts=counts
    )

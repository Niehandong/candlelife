"""当前时刻的唯一取处。

domain/ 是纯函数层，硬约束之一是【不得调用 datetime.now()】—— 当前时刻一律由
调用方传入。那么「调用方从哪里取」就需要一个统一的地方：

  - 原先 api/v1/nights.py 与 api/v1/rewards.py 各定义了一份 `_now()`，
    测试要冻结时间就得 patch 两处，漏一处就得到一个「一半冻住一半没冻」的
    诡异状态（tests/test_e2e_flow.py 的 freeze() 就是为此同时 patch 两个模块）
  - 收在这里之后只有一个 patch 点

**取的一律是 UTC 感知时间**，不是本地时间 —— 时区从 user_settings.timezone
显式传给 domain，不读系统本地时区（见 tests/test_domain_timezone.py）。
"""
from datetime import datetime, timezone


def now() -> datetime:
    """当前 UTC 时刻。测试通过 monkeypatch 这个函数来冻结时间。"""
    return datetime.now(timezone.utc)

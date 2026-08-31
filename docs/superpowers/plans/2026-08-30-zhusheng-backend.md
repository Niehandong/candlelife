# 烛生后端（阶段一）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付烛生阶段一的 Python 后端——微信静默登录、睡前仪式完成、次日奖励揭晓、夜记与收藏，全部业务判定以服务端为权威。

**Architecture:** FastAPI + SQLAlchemy 2.0 async + Alembic + PostgreSQL(asyncpg) + Redis。业务规则集中在 `app/domain/ritual.py` 的纯函数中（零 IO），由 `shared/ritual-cases.json` 契约驱动测试；该契约同时被小程序的 TS 实现消费，防止两端漂移。幂等与正确性由数据库约束和事务保证，Redis 仅作优化。

**Tech Stack:** Python 3.12、FastAPI、SQLAlchemy 2.0 (async)、Alembic、asyncpg、redis-py (async)、Pydantic v2 + pydantic-settings、cryptography (MultiFernet)、PyJWT、pytest + pytest-asyncio + httpx

**Spec:** `docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md`

**领域术语:** `CONTEXT.md`（仪式夜、按时资格、资格窗口、揭晓窗口、连续按时、历史固化等）

## Global Constraints

- **不执行任何 git 命令。** 不 `init`、不 `add`、不 `commit`、不 `push`。每个任务末尾给出建议的 commit message，由用户本人审核后手动提交。
- **服务端是判定的唯一权威。** 任何写接口都不得接受客户端传来的判定结果字段（`is_eligible`、`late_minutes`、`streak`、`reward_draw_count`）。
- **禁止读取系统本地时间做业务判定。** `datetime.now()` 不带时区、`date.today()` 一律禁用；时区必须从 `user_settings.timezone` 显式传入。（spec 修正 6）
- **`app/domain/ritual.py` 必须是纯函数**：不导入 SQLAlchemy、不访问数据库/Redis/网络、不读环境变量、不调用 `now()`。当前时刻一律由调用方作为参数传入。
- **历史固化**：`is_eligible`、`late_minutes`、`reward_draw_count` 在发生当时写入数据库列，任何查询不得重算。
- **抽卡次数用「该仪式夜当时」的连续天数**，不是揭晓时刻的。
- 日志与匿名事件中**严禁**出现 `gratitudes`、`plans`、`openid`、`session_key`。
- 图片路径在数据库中存**相对路径**（如 `art/monet-water-lilies.jpg`），响应时拼接 `ASSET_BASE_URL`。
- 幂等冲突返回 **200 + 既有数据**，不返回 409。
- 默认值（来自 spec）：容差 30 分钟、资格窗口 `20:00`–`02:00`、仪式夜边界 6 点、揭晓窗口次日 `06:00`、时区 `Asia/Shanghai`。

---

## File Structure

```
shared/
  ritual-cases.json          双实现契约（Task 1 创建，小程序计划复用）

backend/
  pyproject.toml             依赖与工具配置
  .env.example               占位符，真 .env 不入库
  alembic.ini
  alembic/env.py
  alembic/versions/
  app/
    main.py                  FastAPI 装配、生命周期、启动自检
    core/
      config.py              Settings
      db.py                  async engine / session
      redis.py               redis 客户端
      crypto.py              MultiFernet 加解密
      security.py            JWT 签发与校验
      errors.py              统一错误信封与异常处理器
    domain/
      ritual.py          ★  纯函数：仪式判定、连续、抽数、揭晓窗口
    models/                  SQLAlchemy ORM，按聚合分文件
      base.py  user.py  night.py  art.py  reward.py  event.py
    schemas/                 Pydantic 出入参
      auth.py  user.py  night.py  reward.py  art.py
    repositories/            数据访问，返回 ORM 或元组
      user.py  night.py  reward.py  art.py
    services/                业务编排，事务边界
      wechat.py              code2Session / msgSecCheck（含 mock）
      auth.py                登录与 token
      ritual.py              完成仪式（幂等）
      reward.py              揭晓（事务）
    api/v1/
      __init__.py            路由汇总
      auth.py  me.py  nights.py  rewards.py  art.py  config.py  events.py
  static/art/                seed 图片
  scripts/seed_art.py        灌 10 幅作品
  tests/
    conftest.py
    test_domain_contract.py  ★ 读 shared/ritual-cases.json
    test_domain_timezone.py  ★ 多时区一致性
    test_crypto.py
    test_auth.py
    test_ritual_api.py
    test_record_edit.py
    test_reward_api.py
    test_collection_api.py
```

---

### Task 0: 脚手架、配置与启动自检

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`, `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`, `backend/tests/test_startup.py`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Settings`（`app.core.config`），字段 `database_url`, `redis_host`, `redis_port`, `redis_db`, `redis_password`, `fernet_keys`, `jwt_secret`, `wx_appid`, `wx_secret`, `wx_mock_login`, `env`, `asset_base_url`
- Produces: `get_settings() -> Settings`（`lru_cache` 单例）
- Produces: `create_app() -> FastAPI`

- [ ] **Step 1: 写失败的启动自检测试**

生产环境不得开启 mock 登录——这个开关一旦误留，任何人可伪造 code 登录任意账号。

`backend/tests/test_startup.py`:

```python
import pytest
from app.core.config import Settings
from app.main import create_app


def _settings(**over):
    base = dict(
        env="development",
        database_url="postgresql+asyncpg://u:p@localhost:5432/test",
        redis_host="localhost", redis_port=6379, redis_db=1, redis_password="x",
        fernet_keys="dGVzdC1rZXktMzItYnl0ZXMtYmFzZTY0LWVuY29kZWQtLQ==",
        jwt_secret="test-secret", asset_base_url="http://localhost:8000/static",
        wx_appid="", wx_secret="", wx_mock_login=True,
    )
    base.update(over)
    return Settings(**base)


def test_production_rejects_mock_login():
    with pytest.raises(ValueError, match="WX_MOCK_LOGIN"):
        _settings(env="production", wx_mock_login=True)


def test_production_requires_wx_credentials():
    with pytest.raises(ValueError, match="WX_APPID"):
        _settings(env="production", wx_mock_login=False, wx_appid="")


def test_development_allows_mock_login():
    s = _settings()
    assert s.wx_mock_login is True


def test_app_boots():
    assert create_app() is not None
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && python -m pytest tests/test_startup.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`

- [ ] **Step 3: 写 pyproject.toml**

`backend/pyproject.toml`:

```toml
[project]
name = "zhusheng-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "redis>=5.2",
    "cryptography>=43.0",
    "pyjwt>=2.10",
    "httpx>=0.28",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "anyio>=4.6"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.setuptools.packages.find]
include = ["app*"]
```

- [ ] **Step 4: 写 config.py**

`backend/app/core/config.py`:

```python
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str
    redis_host: str
    redis_port: int = 6379
    redis_db: int = 1
    redis_password: str = ""
    redis_prefix: str = "zhusheng:"

    fernet_keys: str          # 逗号分隔，第一个为主密钥
    jwt_secret: str
    access_token_ttl_seconds: int = 2 * 60 * 60
    refresh_token_ttl_seconds: int = 30 * 24 * 60 * 60

    wx_appid: str = ""
    wx_secret: str = ""
    wx_mock_login: bool = False

    asset_base_url: str

    @model_validator(mode="after")
    def _guard_production(self):
        if self.env == "production":
            if self.wx_mock_login:
                raise ValueError(
                    "WX_MOCK_LOGIN 不得在 production 开启：任何人可伪造 code 登录任意账号"
                )
            if not self.wx_appid or not self.wx_secret:
                raise ValueError("production 必须配置 WX_APPID 与 WX_SECRET")
        if not self.fernet_keys.strip():
            raise ValueError("FERNET_KEYS 不得为空；丢失密钥将导致历史正文永久不可读")
        return self

    @property
    def fernet_key_list(self) -> list[str]:
        return [k.strip() for k in self.fernet_keys.split(",") if k.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: 写 main.py**

`backend/app/main.py`:

```python
from fastapi import FastAPI

from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()          # 配置非法时在此抛错，进程拒绝启动
    app = FastAPI(title="烛生 API", version="0.1.0")

    @app.get("/health")
    async def health():
        return {"status": "ok", "env": settings.env}

    return app


app = create_app()
```

- [ ] **Step 6: 写 .env.example 并更新 .gitignore**

`backend/.env.example`（**只放占位符，真实口令绝不入库**）:

```bash
ENV=development

# 生成方式：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# 逗号分隔可放多个，第一个用于加密，其余仅用于解密（轮换）
# 警告：密钥丢失将导致所有历史夜记正文永久不可读，务必另存于密码管理器
FERNET_KEYS=REPLACE_WITH_GENERATED_KEY

JWT_SECRET=REPLACE_WITH_RANDOM_SECRET

DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DBNAME
REDIS_HOST=HOST
REDIS_PORT=6379
REDIS_DB=1
REDIS_PASSWORD=REPLACE

# 无 AppID 时开启，可在微信开发者工具中完整调试；production 下开启会拒绝启动
WX_MOCK_LOGIN=true
WX_APPID=
WX_SECRET=

ASSET_BASE_URL=http://localhost:8000/static
```

在仓库根 `.gitignore` 追加：

```
.env
backend/.env
__pycache__/
*.pyc
.venv/
node_modules/
dist/
```

- [ ] **Step 7: 安装依赖并运行测试，确认 GREEN**

Run:
```bash
cd backend && python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest tests/test_startup.py -v
```
Expected: 4 passed

- [ ] **Step 8: 交付检查（不执行 git）**

确认：`.env` 不存在于仓库、`.env.example` 无真实口令、`python -m pytest` 全绿。

建议 commit message（由用户手动提交）：
```
chore(backend): 初始化 FastAPI 脚手架与配置守卫
```

---

### Task 0.5: 生成 CLAUDE.md

**Files:**
- Create: `CLAUDE.md`（仓库根）

- [ ] **Step 1: 运行 /init**

在仓库根运行 `/init`。此时脚手架已就位，`/init` 能扫到 `backend/pyproject.toml`、测试命令、目录分层，生成的 `CLAUDE.md` 才有实际内容。

- [ ] **Step 2: 校验 CLAUDE.md 覆盖以下内容，缺则补写**

- 起服务：`cd backend && .venv/bin/uvicorn app.main:app --reload`
- 跑测试：`cd backend && .venv/bin/python -m pytest`
- 建迁移：`cd backend && .venv/bin/alembic revision --autogenerate -m "..."`
- 分层约定：`api → services → repositories → models`，`domain/` 为纯函数不得反向依赖
- 领域术语指向 `CONTEXT.md`
- **不执行 git 提交**（本项目的硬约束）

- [ ] **Step 3: 交付检查**

建议 commit message：`docs: 添加 CLAUDE.md`

---

### Task 1: 领域纯函数与双实现契约 ★ 核心

这是整个项目的规则中枢，后续所有任务依赖它。**必须先于任何 API 完成。**

**Files:**
- Create: `shared/ritual-cases.json`
- Create: `backend/app/domain/__init__.py`, `backend/app/domain/ritual.py`
- Create: `backend/tests/test_domain_contract.py`
- Create: `backend/tests/test_domain_timezone.py`

**Interfaces:**
- Produces: `RITUAL_NIGHT_BOUNDARY_HOUR = 6`, `REVEAL_HOUR = 6`
- Produces: `@dataclass(frozen=True) CompletionAssessment(ritual_date: date, planned_at: datetime, completed_at: datetime, late_minutes: int, eligible: bool)`
- Produces: `current_ritual_night(now: datetime, tz: str) -> date`
- Produces: `evaluate_completion(*, planned_time: time, completed_at: datetime, tz: str, tolerance_minutes: int, min_time: time, max_time: time) -> CompletionAssessment`
- Produces: `calculate_on_time_streak(records: Sequence[tuple[date, bool]], current_night: date) -> int`
- Produces: `reward_draw_count(streak: int) -> int`
- Produces: `reveal_window_opens_at(ritual_date: date, tz: str) -> datetime`
- Produces: `can_reveal(*, ritual_date: date, is_eligible: bool, reward_revealed_at: datetime | None, now: datetime, tz: str) -> bool`
- Produces: `summarize_collection(art_ids: Sequence[str]) -> CollectionSummary(total_cards, unique_works, counts)`

- [ ] **Step 1: 写契约文件 shared/ritual-cases.json**

用例种子取自原型 `prototype/tests/zhusheng-core.test.js`，并补上 spec 的 7 处修正。

```json
{
  "_comment": "双实现契约。backend/tests/test_domain_contract.py 与 miniprogram 的 vitest 读同一份文件。规则变更须先改此文件。",
  "evaluate_completion": [
    {
      "name": "容差内按时",
      "in": {"planned_time": "23:30", "completed_at": "2026-08-27T23:59:00+08:00",
             "tz": "Asia/Shanghai", "tolerance_minutes": 30,
             "min_time": "20:00", "max_time": "02:00"},
      "out": {"ritual_date": "2026-08-27", "late_minutes": 29, "eligible": true}
    },
    {
      "name": "跨午夜超出容差",
      "in": {"planned_time": "23:30", "completed_at": "2026-08-28T00:01:00+08:00",
             "tz": "Asia/Shanghai", "tolerance_minutes": 30,
             "min_time": "20:00", "max_time": "02:00"},
      "out": {"ritual_date": "2026-08-27", "late_minutes": 31, "eligible": false}
    },
    {
      "name": "凌晨计划时间归属前一晚",
      "in": {"planned_time": "00:30", "completed_at": "2026-08-28T00:45:00+08:00",
             "tz": "Asia/Shanghai", "tolerance_minutes": 30,
             "min_time": "20:00", "max_time": "02:00"},
      "out": {"ritual_date": "2026-08-27", "late_minutes": 15, "eligible": true}
    },
    {
      "name": "修正3：下午完成落在资格窗口外，不合格",
      "in": {"planned_time": "23:30", "completed_at": "2026-08-27T17:30:00+08:00",
             "tz": "Asia/Shanghai", "tolerance_minutes": 30,
             "min_time": "20:00", "max_time": "02:00"},
      "out": {"ritual_date": "2026-08-27", "late_minutes": 0, "eligible": false}
    },
    {
      "name": "修正3：提前入睡但在窗口内，合格",
      "in": {"planned_time": "23:30", "completed_at": "2026-08-27T21:00:00+08:00",
             "tz": "Asia/Shanghai", "tolerance_minutes": 30,
             "min_time": "20:00", "max_time": "02:00"},
      "out": {"ritual_date": "2026-08-27", "late_minutes": 0, "eligible": true}
    },
    {
      "name": "修正3：凌晨3点超出窗口上界，不合格",
      "in": {"planned_time": "23:30", "completed_at": "2026-08-28T03:00:00+08:00",
             "tz": "Asia/Shanghai", "tolerance_minutes": 30,
             "min_time": "20:00", "max_time": "02:00"},
      "out": {"ritual_date": "2026-08-27", "late_minutes": 210, "eligible": false}
    }
  ],
  "current_ritual_night": [
    {"name": "凌晨2点属于前一晚",
     "in": {"now": "2026-08-28T02:00:00+08:00", "tz": "Asia/Shanghai"},
     "out": "2026-08-27"},
    {"name": "上午9点属于当天",
     "in": {"now": "2026-08-28T09:00:00+08:00", "tz": "Asia/Shanghai"},
     "out": "2026-08-28"},
    {"name": "恰好6点属于当天",
     "in": {"now": "2026-08-28T06:00:00+08:00", "tz": "Asia/Shanghai"},
     "out": "2026-08-28"}
  ],
  "calculate_on_time_streak": [
    {"name": "连续3晚",
     "in": {"records": [["2026-08-25", true], ["2026-08-26", true], ["2026-08-27", true]],
            "current_night": "2026-08-27"},
     "out": 3},
    {"name": "中间断一晚只算最近连续段",
     "in": {"records": [["2026-08-24", true], ["2026-08-26", true], ["2026-08-27", true]],
            "current_night": "2026-08-27"},
     "out": 2},
    {"name": "最近一晚未按时则为0",
     "in": {"records": [["2026-08-26", true], ["2026-08-27", false]],
            "current_night": "2026-08-27"},
     "out": 0},
    {"name": "今晚尚未完成，昨晚记录仍算数",
     "in": {"records": [["2026-08-26", true], ["2026-08-27", true]],
            "current_night": "2026-08-28"},
     "out": 2},
    {"name": "修正2：停用多日后衰减为0",
     "in": {"records": [["2026-08-01", true], ["2026-08-02", true], ["2026-08-03", true]],
            "current_night": "2026-08-21"},
     "out": 0},
    {"name": "无记录为0",
     "in": {"records": [], "current_night": "2026-08-27"}, "out": 0}
  ],
  "reward_draw_count": [
    {"in": {"streak": 1}, "out": 1},
    {"in": {"streak": 2}, "out": 1},
    {"in": {"streak": 3}, "out": 2},
    {"in": {"streak": 4}, "out": 1},
    {"in": {"streak": 7}, "out": 2},
    {"in": {"streak": 8}, "out": 1},
    {"in": {"streak": 14}, "out": 2},
    {"in": {"streak": 29}, "out": 1},
    {"in": {"streak": 30}, "out": 3},
    {"in": {"streak": 31}, "out": 2},
    {"in": {"streak": 60}, "out": 3},
    {"in": {"streak": 100}, "out": 2}
  ],
  "can_reveal": [
    {"name": "修正1：仪式夜次日6点前不可揭晓",
     "in": {"ritual_date": "2026-08-27", "is_eligible": true, "reward_revealed_at": null,
            "now": "2026-08-28T05:59:00+08:00", "tz": "Asia/Shanghai"},
     "out": false},
    {"name": "修正1：仪式夜次日6点整可揭晓",
     "in": {"ritual_date": "2026-08-27", "is_eligible": true, "reward_revealed_at": null,
            "now": "2026-08-28T06:00:00+08:00", "tz": "Asia/Shanghai"},
     "out": true},
    {"name": "修正1：凌晨完成者与常规完成者同日揭晓",
     "in": {"ritual_date": "2026-08-27", "is_eligible": true, "reward_revealed_at": null,
            "now": "2026-08-28T07:30:00+08:00", "tz": "Asia/Shanghai"},
     "out": true},
    {"name": "不合格不可揭晓",
     "in": {"ritual_date": "2026-08-27", "is_eligible": false, "reward_revealed_at": null,
            "now": "2026-08-29T09:00:00+08:00", "tz": "Asia/Shanghai"},
     "out": false},
    {"name": "已揭晓不可重复",
     "in": {"ritual_date": "2026-08-27", "is_eligible": true,
            "reward_revealed_at": "2026-08-28T07:00:00+08:00",
            "now": "2026-08-29T09:00:00+08:00", "tz": "Asia/Shanghai"},
     "out": false}
  ],
  "summarize_collection": [
    {"in": {"art_ids": ["a", "a", "b"]},
     "out": {"total_cards": 3, "unique_works": 2, "counts": {"a": 2, "b": 1}}},
    {"in": {"art_ids": []},
     "out": {"total_cards": 0, "unique_works": 0, "counts": {}}}
  ]
}
```

- [ ] **Step 2: 写契约测试**

`backend/tests/test_domain_contract.py`:

```python
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
    got = ritual.current_ritual_night(
        datetime.fromisoformat(case["in"]["now"]), case["in"]["tz"]
    )
    assert got == date.fromisoformat(case["out"])


@pytest.mark.parametrize("case", CASES["calculate_on_time_streak"], ids=lambda c: c["name"])
def test_calculate_on_time_streak(case):
    i = case["in"]
    records = [(date.fromisoformat(d), e) for d, e in i["records"]]
    got = ritual.calculate_on_time_streak(records, date.fromisoformat(i["current_night"]))
    assert got == case["out"]


@pytest.mark.parametrize("case", CASES["reward_draw_count"], ids=lambda c: str(c["in"]["streak"]))
def test_reward_draw_count(case):
    assert ritual.reward_draw_count(case["in"]["streak"]) == case["out"]


@pytest.mark.parametrize("case", CASES["can_reveal"], ids=lambda c: c["name"])
def test_can_reveal(case):
    i = case["in"]
    revealed = i["reward_revealed_at"]
    got = ritual.can_reveal(
        ritual_date=date.fromisoformat(i["ritual_date"]),
        is_eligible=i["is_eligible"],
        reward_revealed_at=datetime.fromisoformat(revealed) if revealed else None,
        now=datetime.fromisoformat(i["now"]),
        tz=i["tz"],
    )
    assert got == case["out"]


@pytest.mark.parametrize("case", CASES["summarize_collection"], ids=lambda c: str(c["in"]))
def test_summarize_collection(case):
    got = ritual.summarize_collection(case["in"]["art_ids"])
    o = case["out"]
    assert got.total_cards == o["total_cards"]
    assert got.unique_works == o["unique_works"]
    assert got.counts == o["counts"]
```

- [ ] **Step 3: 写时区一致性测试（spec 修正 6）**

`backend/tests/test_domain_timezone.py`:

```python
import os
import time as _time
from datetime import date, datetime, time

import pytest

from app.domain import ritual

SERVER_TZS = ["UTC", "Asia/Shanghai", "America/New_York"]


@pytest.mark.parametrize("server_tz", SERVER_TZS)
def test_result_independent_of_server_timezone(server_tz, monkeypatch):
    """服务器时区改变不得影响判定结果——原型的核心缺陷（spec 修正 6）。"""
    monkeypatch.setenv("TZ", server_tz)
    if hasattr(_time, "tzset"):
        _time.tzset()

    got = ritual.evaluate_completion(
        planned_time=time(23, 30),
        completed_at=datetime.fromisoformat("2026-08-27T23:59:00+08:00"),
        tz="Asia/Shanghai",
        tolerance_minutes=30,
        min_time=time(20, 0),
        max_time=time(2, 0),
    )
    assert got.ritual_date == date(2026, 8, 27)
    assert got.late_minutes == 29
    assert got.eligible is True


@pytest.mark.parametrize("server_tz", SERVER_TZS)
def test_current_ritual_night_independent_of_server_timezone(server_tz, monkeypatch):
    monkeypatch.setenv("TZ", server_tz)
    if hasattr(_time, "tzset"):
        _time.tzset()
    got = ritual.current_ritual_night(
        datetime.fromisoformat("2026-08-28T02:00:00+08:00"), "Asia/Shanghai"
    )
    assert got == date(2026, 8, 27)


def test_user_in_different_timezone():
    """用户在纽约，按其本地时间判定。"""
    got = ritual.evaluate_completion(
        planned_time=time(23, 30),
        completed_at=datetime.fromisoformat("2026-08-27T23:45:00-04:00"),
        tz="America/New_York",
        tolerance_minutes=30,
        min_time=time(20, 0),
        max_time=time(2, 0),
    )
    assert got.ritual_date == date(2026, 8, 27)
    assert got.eligible is True
```

- [ ] **Step 4: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_domain_contract.py tests/test_domain_timezone.py -v`
Expected: FAIL — `ImportError: cannot import name 'ritual' from 'app.domain'`

- [ ] **Step 5: 实现 domain/ritual.py**

`backend/app/domain/ritual.py`（**纯函数：不导入 SQLAlchemy、不访问 IO、不调用 now()**）:

```python
"""烛生的业务规则。纯函数，零 IO。

对应 prototype/zhusheng-core.js，但修正了其中 7 处缺陷，
详见 docs/superpowers/specs/2026-08-30-zhusheng-backend-miniprogram-design.md。
本模块的行为由 shared/ritual-cases.json 契约锁定，小程序的 TS 实现读同一份用例。
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
    anchor = planned_at - timedelta(days=1) if planned_at.hour < RITUAL_NIGHT_BOUNDARY_HOUR else planned_at

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


def calculate_on_time_streak(
    records: Sequence[tuple[date, bool]], current_night: date
) -> int:
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


def reward_draw_count(streak: int) -> int:
    """抽卡次数。基础 1 抽，连续满 30 晚后基础 2 抽；里程碑额外 +1。"""
    base = 2 if streak >= 30 else 1
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
```

- [ ] **Step 6: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_domain_contract.py tests/test_domain_timezone.py -v`
Expected: 全部 PASS（约 33 条）

- [ ] **Step 7: 验证纯度**

Run:
```bash
cd backend && grep -nE 'sqlalchemy|redis|httpx|os\.environ|datetime\.now\(\)|date\.today\(\)' app/domain/ritual.py \
  && echo "★ 违反纯函数约束" || echo "纯度检查通过"
```
Expected: `纯度检查通过`

- [ ] **Step 8: 交付检查**

建议 commit message：
```
feat(domain): 实现仪式判定纯函数，修正原型 7 处规则缺陷

- 揭晓窗口改为仪式夜次日 06:00，消除凌晨完成者多等一天
- 连续按时随时间衰减
- 引入资格窗口，堵住下午提前刷完仪式
- 抽卡曲线改为满 30 晚基础双抽 + 里程碑
- 时区显式传入，不再依赖系统本地时间
- 由 shared/ritual-cases.json 契约锁定，小程序端复用同一份用例
```

---

### Task 2: 数据模型与迁移

**Files:**
- Create: `backend/app/core/db.py`
- Create: `backend/app/models/__init__.py`, `base.py`, `user.py`, `night.py`, `art.py`, `reward.py`, `event.py`
- Create: `backend/alembic.ini`, `backend/alembic/env.py`
- Create: `backend/alembic/versions/0001_initial.py`
- Create: `backend/tests/conftest.py`, `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `get_settings()`（Task 0）
- Produces: `Base`, `User`, `UserSettings`, `NightRecord`, `ArtWork`, `Reward`, `AnalyticsEvent`
- Produces: `get_session() -> AsyncIterator[AsyncSession]`（FastAPI 依赖）
- Produces: pytest fixture `session`（每测试一事务，结束回滚）

- [ ] **Step 1: 写失败的约束测试**

数据库约束是幂等与历史固化的根，必须直接测。

`backend/tests/test_models.py`:

```python
from datetime import date, datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import ArtWork, NightRecord, Reward, User


async def _user(session, openid="o1"):
    u = User(openid=openid)
    session.add(u)
    await session.flush()
    return u


def _night(user_id, ritual_date):
    return NightRecord(
        user_id=user_id, ritual_date=ritual_date,
        planned_at=datetime(2026, 8, 27, 23, 30, tzinfo=timezone.utc),
        completed_at=datetime(2026, 8, 27, 23, 59, tzinfo=timezone.utc),
        late_minutes=29, is_eligible=True,
    )


async def test_one_night_record_per_ritual_date(session):
    """同一用户同一仪式夜只能有一条夜记——幂等的根。"""
    u = await _user(session)
    session.add(_night(u.id, date(2026, 8, 27)))
    await session.flush()
    session.add(_night(u.id, date(2026, 8, 27)))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_art_work_rejects_blank_required_field(session):
    session.add(ArtWork(
        id="blank", title="  ", artist="a", year="2026",
        thumbnail="t.jpg", image="i.jpg", alt="alt", source="src", article="art",
    ))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_collected_art_cannot_be_deleted(session):
    """被收藏过的作品不可物理删除，只能下架或撤回。"""
    u = await _user(session)
    night = _night(u.id, date(2026, 8, 27))
    art = ArtWork(
        id="monet", title="睡莲", artist="莫奈", year="1916",
        thumbnail="t.jpg", image="i.jpg", alt="alt", source="src", article="article",
    )
    session.add_all([night, art])
    await session.flush()
    session.add(Reward(user_id=u.id, night_record_id=night.id, art_id=art.id))
    await session.flush()

    await session.delete(art)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_deleting_user_cascades_all_data(session):
    """注销即物理删除全部数据。"""
    from sqlalchemy import func, select

    u = await _user(session, "to-delete")
    session.add(_night(u.id, date(2026, 8, 27)))
    await session.flush()

    await session.delete(u)
    await session.flush()

    remaining = await session.scalar(
        select(func.count()).select_from(NightRecord).where(NightRecord.user_id == u.id)
    )
    assert remaining == 0
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 3: 写 db.py**

`backend/app/core/db.py`:

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_settings = get_settings()
engine = create_async_engine(_settings.database_url, pool_pre_ping=True, future=True)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session
```

- [ ] **Step 4: 写 ORM 模型**

`backend/app/models/base.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


def uuid_pk() -> Mapped[uuid.UUID]:
    from sqlalchemy.dialects.postgresql import UUID
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
```

`backend/app/models/user.py`:

```python
import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Time, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    openid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    unionid: Mapped[str | None] = mapped_column(String(128), unique=True)
    nickname: Mapped[str | None] = mapped_column(String(64))
    avatar_url: Mapped[str | None] = mapped_column(String(512))

    settings: Mapped["UserSettings"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    bedtime: Mapped[time] = mapped_column(Time, nullable=False, server_default="23:30")
    wake_time: Mapped[time] = mapped_column(Time, nullable=False, server_default="07:30")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Asia/Shanghai")
    reduced_motion: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="settings")
```

`backend/app/models/night.py`:

```python
import uuid
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, Date, DateTime, ForeignKey, Index,
                        Integer, LargeBinary, SmallInteger, String, UniqueConstraint)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NightRecord(Base, TimestampMixin):
    __tablename__ = "night_records"
    __table_args__ = (
        UniqueConstraint("user_id", "ritual_date", name="uq_night_user_date"),
        Index("ix_night_user_date_desc", "user_id", "ritual_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    ritual_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    resistance_reason: Mapped[str | None] = mapped_column(String(128))
    gratitudes_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    plans_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    reward_revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reward_draw_count: Mapped[int | None] = mapped_column(SmallInteger)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    # 严禁写入 gratitudes / plans / openid 等，见 core/errors.py 的 SENSITIVE_KEYS
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

`backend/app/models/art.py`:

```python
from sqlalchemy import Boolean, CheckConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

_NONBLANK = " AND ".join(
    f"length(btrim({c})) > 0" for c in
    ("title", "artist", "year", "thumbnail", "image", "alt", "source", "article")
)


class ArtWork(Base, TimestampMixin):
    __tablename__ = "art_works"
    __table_args__ = (CheckConstraint(_NONBLANK, name="ck_art_required_nonblank"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)      # slug
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    artist: Mapped[str] = mapped_column(String(128), nullable=False)
    year: Mapped[str] = mapped_column(String(64), nullable=False)
    thumbnail: Mapped[str] = mapped_column(String(256), nullable=False)  # 相对路径
    image: Mapped[str] = mapped_column(String(256), nullable=False)      # 相对路径
    alt: Mapped[str] = mapped_column(String(256), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    article: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    is_withdrawn: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
```

`backend/app/models/reward.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Reward(Base):
    __tablename__ = "rewards"
    __table_args__ = (Index("ix_reward_user_awarded", "user_id", "awarded_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    night_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("night_records.id", ondelete="CASCADE"), nullable=False
    )
    # RESTRICT：被收藏过的作品不可物理删除，只能下架或撤回
    art_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("art_works.id", ondelete="RESTRICT"), nullable=False
    )
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
```

`backend/app/models/__init__.py`:

```python
from app.models.art import ArtWork
from app.models.base import Base
from app.models.night import AnalyticsEvent, NightRecord
from app.models.reward import Reward
from app.models.user import User, UserSettings

__all__ = ["Base", "User", "UserSettings", "NightRecord",
           "AnalyticsEvent", "ArtWork", "Reward"]
```

- [ ] **Step 5: 写 conftest.py**

`backend/tests/conftest.py`:

```python
import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base

TEST_DB_URL = os.environ["TEST_DATABASE_URL"]   # 必须显式设置，避免误连生产库


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(TEST_DB_URL, future=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    """每个测试跑在独立事务里，结束回滚，互不干扰。"""
    conn = await engine.connect()
    trans = await conn.begin()
    maker = async_sessionmaker(bind=conn, expire_on_commit=False, class_=AsyncSession)
    async with maker() as s:
        yield s
    await trans.rollback()
    await conn.close()
```

> **注意**：`TEST_DATABASE_URL` 无默认值——未设置则测试直接报错，
> 避免默认值指向生产库导致 `drop_all` 清空真实数据。执行前由用户设置：
>
> ```bash
> export TEST_DATABASE_URL='postgresql+asyncpg://USER:PASS@HOST:PORT/eastern_test'
> ```
>
> 该库必须与生产库分开——fixture 每次会话都会 `drop_all` 重建全部表。

- [ ] **Step 6: 配置 Alembic 并生成迁移**

`backend/alembic/env.py` 关键部分：

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def _run(connection):
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    engine = create_async_engine(get_settings().database_url)
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=get_settings().database_url, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_async_migrations())
```

Run: `cd backend && .venv/bin/alembic revision --autogenerate -m "initial schema"`

生成后**人工检查** `alembic/versions/0001_*.py`，确认包含：
`uq_night_user_date` 唯一约束、`ck_art_required_nonblank` 检查约束、
`rewards.art_id` 的 `ondelete="RESTRICT"`、其余外键的 `ondelete="CASCADE"`。

- [ ] **Step 7: 应用迁移并运行测试，确认 GREEN**

Run:
```bash
cd backend && .venv/bin/alembic upgrade head
.venv/bin/python -m pytest tests/test_models.py -v
```
Expected: 4 passed

- [ ] **Step 8: 交付检查**

建议 commit message：
```
feat(models): 建立数据模型与初始迁移

唯一约束保证一仪式夜一夜记；作品外键 RESTRICT 防止误删已收藏作品；
用户外键 CASCADE 支撑注销时的物理删除。
```

---

### Task 3: 正文加密

**Files:**
- Create: `backend/app/core/crypto.py`
- Create: `backend/tests/test_crypto.py`

**Interfaces:**
- Consumes: `get_settings().fernet_key_list`
- Produces: `encrypt_text(plain: str | None) -> bytes | None`
- Produces: `decrypt_text(blob: bytes | None) -> str | None`（失败抛 `DecryptError`）
- Produces: `encrypt_list(values: list[str]) -> bytes | None`, `decrypt_list(blob) -> list[str]`
- Produces: `class DecryptError(Exception)`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_crypto.py`:

```python
import pytest
from cryptography.fernet import Fernet

from app.core import crypto


def test_roundtrip_text():
    blob = crypto.encrypt_text("感谢今天的阳光")
    assert blob is not None and b"\xe6" not in blob[:4]      # 已加密，非明文 UTF-8
    assert crypto.decrypt_text(blob) == "感谢今天的阳光"


def test_roundtrip_list():
    values = ["感谢今天的阳光", "感谢一顿好饭", "感谢准时下班"]
    assert crypto.decrypt_list(crypto.encrypt_list(values)) == values


def test_none_passthrough():
    assert crypto.encrypt_text(None) is None
    assert crypto.decrypt_text(None) is None
    assert crypto.encrypt_list([]) is None
    assert crypto.decrypt_list(None) == []


def test_ciphertext_differs_each_time():
    """Fernet 自带随机 IV，同一明文两次加密结果不同。"""
    assert crypto.encrypt_text("同样的话") != crypto.encrypt_text("同样的话")


def test_key_rotation_keeps_old_data_readable(monkeypatch):
    """新密钥插到最前后，旧密钥加密的数据仍可解密。"""
    old_key, new_key = Fernet.generate_key().decode(), Fernet.generate_key().decode()

    monkeypatch.setattr(crypto, "_build_fernet", lambda: crypto.MultiFernet(
        [Fernet(old_key)]))
    crypto.reset_cache()
    blob = crypto.encrypt_text("轮换前写下的内容")

    monkeypatch.setattr(crypto, "_build_fernet", lambda: crypto.MultiFernet(
        [Fernet(new_key), Fernet(old_key)]))
    crypto.reset_cache()
    assert crypto.decrypt_text(blob) == "轮换前写下的内容"


def test_tampered_ciphertext_raises():
    blob = bytearray(crypto.encrypt_text("原文"))
    blob[-1] ^= 0xFF
    with pytest.raises(crypto.DecryptError):
        crypto.decrypt_text(bytes(blob))
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_crypto.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.crypto'`

- [ ] **Step 3: 实现 crypto.py**

`backend/app/core/crypto.py`:

```python
"""夜记正文的应用层加密。

使用 MultiFernet：首个密钥加密，解密时依次尝试全部密钥，
支持在不停机、不批量重加密的前提下轮换密钥。

警告：FERNET_KEYS 丢失将导致所有历史正文永久不可读，无后门。
"""

import json

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import get_settings


class DecryptError(Exception):
    """密文损坏、被篡改，或当前密钥集无法解开。"""


_cache: MultiFernet | None = None


def _build_fernet() -> MultiFernet:
    return MultiFernet([Fernet(k) for k in get_settings().fernet_key_list])


def _fernet() -> MultiFernet:
    global _cache
    if _cache is None:
        _cache = _build_fernet()
    return _cache


def reset_cache() -> None:
    """仅供测试轮换密钥时使用。"""
    global _cache
    _cache = None


def encrypt_text(plain: str | None) -> bytes | None:
    if plain is None:
        return None
    return _fernet().encrypt(plain.encode("utf-8"))


def decrypt_text(blob: bytes | None) -> str | None:
    if blob is None:
        return None
    try:
        return _fernet().decrypt(bytes(blob)).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise DecryptError("正文解密失败") from exc


def encrypt_list(values: list[str] | None) -> bytes | None:
    if not values:
        return None
    return encrypt_text(json.dumps(values, ensure_ascii=False))


def decrypt_list(blob: bytes | None) -> list[str]:
    if blob is None:
        return []
    return json.loads(decrypt_text(blob))
```

- [ ] **Step 4: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_crypto.py -v`
Expected: 6 passed

- [ ] **Step 5: 交付检查**

建议 commit message：`feat(crypto): 用 MultiFernet 加密夜记正文，支持密钥轮换`

---

### Task 4: 微信登录与 JWT

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/services/__init__.py`, `wechat.py`, `auth.py`
- Create: `backend/app/schemas/__init__.py`, `auth.py`
- Create: `backend/app/repositories/__init__.py`, `user.py`
- Create: `backend/app/api/__init__.py`, `backend/app/api/v1/__init__.py`, `backend/app/api/v1/auth.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `User`, `UserSettings`（Task 2）, `get_settings()`（Task 0）
- Produces: `create_access_token(user_id: uuid.UUID) -> str`, `create_refresh_token(...) -> str`, `decode_token(token: str) -> dict`
- Produces: `WeChatClient.code_to_session(code: str) -> str`（返回 openid）
- Produces: `WeChatClient.check_text(text: str) -> bool`
- Produces: `AuthService.login_with_code(session, code) -> tuple[User, str, str]`
- Produces: FastAPI 依赖 `current_user(...) -> User`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_auth.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core import security
from app.main import create_app
from app.models import User, UserSettings


@pytest.fixture
def client(session, monkeypatch):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_mock_login_creates_user_and_settings(client, session):
    r = await client.post("/api/v1/auth/wx-login", json={"code": "abc"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["refresh_token"]

    users = (await session.scalars(select(User).where(User.openid == "mock_openid_abc"))).all()
    assert len(users) == 1
    settings_row = await session.get(UserSettings, users[0].id)
    assert settings_row.timezone == "Asia/Shanghai"     # 默认设置随账号建立
    assert str(settings_row.bedtime) == "23:30:00"


async def test_login_twice_reuses_same_user(client, session):
    await client.post("/api/v1/auth/wx-login", json={"code": "same"})
    await client.post("/api/v1/auth/wx-login", json={"code": "same"})
    count = await session.scalar(
        select(func.count()).select_from(User).where(User.openid == "mock_openid_same")
    )
    assert count == 1


async def test_jwt_payload_excludes_openid():
    """token 泄露不应连带泄露微信身份。"""
    import uuid
    token = security.create_access_token(uuid.uuid4())
    payload = security.decode_token(token)
    assert "openid" not in payload
    assert "sub" in payload and "exp" in payload


async def test_refresh_returns_new_access_token(client):
    r = await client.post("/api/v1/auth/wx-login", json={"code": "ref"})
    refresh = r.json()["refresh_token"]
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 200 and r2.json()["access_token"]


async def test_access_token_rejected_as_refresh(client):
    r = await client.post("/api/v1/auth/wx-login", json={"code": "mix"})
    access = r.json()["access_token"]
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert r2.status_code == 401
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -v`
Expected: FAIL — 404，路由不存在

- [ ] **Step 3: 实现 security.py**

`backend/app/core/security.py`:

```python
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

_ALG = "HS256"
_bearer = HTTPBearer(auto_error=False)


def _encode(user_id: uuid.UUID, ttl: int, kind: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "kind": kind,                       # access | refresh，不可混用
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=_ALG)


def create_access_token(user_id: uuid.UUID) -> str:
    return _encode(user_id, get_settings().access_token_ttl_seconds, "access")


def create_refresh_token(user_id: uuid.UUID) -> str:
    return _encode(user_id, get_settings().refresh_token_ttl_seconds, "refresh")


def decode_token(token: str, expect_kind: str = "access") -> dict:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[_ALG])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "TOKEN_INVALID") from exc
    if payload.get("kind") != expect_kind:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "TOKEN_KIND_MISMATCH")
    return payload


async def current_user_id(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> uuid.UUID:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "TOKEN_MISSING")
    return uuid.UUID(decode_token(cred.credentials)["sub"])
```

- [ ] **Step 4: 实现 wechat.py（含 mock）**

`backend/app/services/wechat.py`:

```python
import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings


class WeChatClient:
    """code2Session 与内容安全检测。

    WX_MOCK_LOGIN=true 时全部走本地桩，无需 AppID 即可在开发者工具中完整调试。
    production 下该开关会导致进程拒绝启动（见 core/config.py）。
    """

    async def code_to_session(self, code: str) -> str:
        settings = get_settings()
        if settings.wx_mock_login:
            return f"mock_openid_{code}"

        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params={"appid": settings.wx_appid, "secret": settings.wx_secret,
                        "js_code": code, "grant_type": "authorization_code"},
            )
        data = resp.json()
        if "openid" not in data:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "WX_CODE_INVALID")
        return data["openid"]

    async def check_text(self, text: str) -> bool:
        """微信侧故障时返回 False（拒绝保存），绝不放行。"""
        if get_settings().wx_mock_login:
            return True
        # 真实实现：POST /wxa/msg_sec_check，异常一律返回 False
        raise NotImplementedError("待 AppID 就绪后接入 msgSecCheck")
```

- [ ] **Step 5: 实现 repository、service、schema 与路由**

`backend/app/repositories/user.py`:

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserSettings


async def get_by_openid(session: AsyncSession, openid: str) -> User | None:
    return await session.scalar(select(User).where(User.openid == openid))


async def create_with_defaults(session: AsyncSession, openid: str) -> User:
    user = User(openid=openid)
    session.add(user)
    await session.flush()
    session.add(UserSettings(user_id=user.id))
    await session.flush()
    return user


async def get(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)
```

`backend/app/schemas/auth.py`:

```python
from pydantic import BaseModel, Field


class WxLoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class AccessToken(BaseModel):
    access_token: str
```

`backend/app/services/auth.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.repositories import user as user_repo
from app.services.wechat import WeChatClient


class AuthService:
    def __init__(self, wechat: WeChatClient | None = None):
        self.wechat = wechat or WeChatClient()

    async def login_with_code(self, session: AsyncSession, code: str):
        openid = await self.wechat.code_to_session(code)
        user = await user_repo.get_by_openid(session, openid)
        if user is None:
            user = await user_repo.create_with_defaults(session, openid)
        await session.commit()
        return (user,
                security.create_access_token(user.id),
                security.create_refresh_token(user.id))
```

`backend/app/api/v1/auth.py`:

```python
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.db import get_session
from app.schemas.auth import AccessToken, RefreshRequest, TokenPair, WxLoginRequest
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/wx-login", response_model=TokenPair)
async def wx_login(body: WxLoginRequest, session: AsyncSession = Depends(get_session)):
    _, access, refresh = await AuthService().login_with_code(session, body.code)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=AccessToken)
async def refresh(body: RefreshRequest):
    payload = security.decode_token(body.refresh_token, expect_kind="refresh")
    return AccessToken(access_token=security.create_access_token(uuid.UUID(payload["sub"])))
```

`backend/app/api/v1/__init__.py`:

```python
from fastapi import APIRouter

from app.api.v1 import auth

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
```

在 `backend/app/main.py` 的 `create_app()` 中挂载：

```python
    from app.api.v1 import api_router
    app.include_router(api_router)
```

- [ ] **Step 6: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -v`
Expected: 5 passed

- [ ] **Step 7: 交付检查**

建议 commit message：
```
feat(auth): 微信静默登录与 JWT

mock 模式支持无 AppID 开发；JWT 载荷不含 openid；
access/refresh 用 kind 字段区分，不可混用。
```

---

### Task 5: 用户资料、设置与注销

**Files:**
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/api/v1/me.py`
- Modify: `backend/app/api/v1/__init__.py`
- Create: `backend/tests/test_me_api.py`

**Interfaces:**
- Consumes: `current_user_id`（Task 4）, `UserSettings`（Task 2）, `WeChatClient.check_text`（Task 4）
- Produces: `GET /api/v1/me`, `PATCH /api/v1/me`, `PUT /api/v1/me/settings`, `DELETE /api/v1/me`
- Produces: `MeResponse`, `SettingsUpdate`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_me_api.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.main import create_app
from app.models import NightRecord, User


@pytest.fixture
async def auth_client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await client.post("/api/v1/auth/wx-login", json={"code": "me"})).json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


async def test_get_me_returns_defaults(auth_client):
    body = (await auth_client.get("/api/v1/me")).json()
    assert body["settings"]["timezone"] == "Asia/Shanghai"
    assert body["settings"]["bedtime"] == "23:30"
    assert body["nickname"] is None


async def test_update_settings(auth_client):
    r = await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "00:30", "wake_time": "08:00",
        "timezone": "America/New_York", "reduced_motion": True,
    })
    assert r.status_code == 200
    assert r.json()["timezone"] == "America/New_York"
    assert (await auth_client.get("/api/v1/me")).json()["settings"]["bedtime"] == "00:30"


async def test_reject_invalid_timezone(auth_client):
    r = await auth_client.put("/api/v1/me/settings", json={
        "bedtime": "23:30", "wake_time": "07:30",
        "timezone": "Mars/Olympus", "reduced_motion": False,
    })
    assert r.status_code == 422


async def test_update_nickname_passes_content_check(auth_client):
    r = await auth_client.patch("/api/v1/me", json={"nickname": "夜行人"})
    assert r.status_code == 200 and r.json()["nickname"] == "夜行人"


async def test_delete_account_removes_all_data(auth_client, session):
    from datetime import date, datetime, timezone as tz
    user = (await session.scalars(select(User))).first()
    session.add(NightRecord(
        user_id=user.id, ritual_date=date(2026, 8, 27),
        planned_at=datetime(2026, 8, 27, 15, 30, tzinfo=tz.utc),
        completed_at=datetime(2026, 8, 27, 15, 59, tzinfo=tz.utc),
        late_minutes=29, is_eligible=True,
    ))
    await session.flush()

    assert (await auth_client.delete("/api/v1/me")).status_code == 204
    assert await session.scalar(select(func.count()).select_from(User).where(User.id == user.id)) == 0
    assert await session.scalar(
        select(func.count()).select_from(NightRecord).where(NightRecord.user_id == user.id)) == 0
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_me_api.py -v`
Expected: FAIL — 404

- [ ] **Step 3: 写 schemas/user.py**

```python
from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_serializer, field_validator


class SettingsPayload(BaseModel):
    bedtime: time
    wake_time: time
    timezone: str
    reduced_motion: bool

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"未知时区：{v}") from exc
        return v

    @field_serializer("bedtime", "wake_time")
    def _hhmm(self, v: time) -> str:
        return v.strftime("%H:%M")


class NicknameUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=32)


class MeResponse(BaseModel):
    id: str
    nickname: str | None
    avatar_url: str | None
    settings: SettingsPayload
```

- [ ] **Step 4: 写 api/v1/me.py**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.models import UserSettings
from app.repositories import user as user_repo
from app.schemas.user import MeResponse, NicknameUpdate, SettingsPayload
from app.services.wechat import WeChatClient

router = APIRouter(prefix="/me", tags=["me"])


def _to_response(user, s: UserSettings) -> MeResponse:
    return MeResponse(
        id=str(user.id), nickname=user.nickname, avatar_url=user.avatar_url,
        settings=SettingsPayload(bedtime=s.bedtime, wake_time=s.wake_time,
                                 timezone=s.timezone, reduced_motion=s.reduced_motion),
    )


@router.get("", response_model=MeResponse)
async def get_me(user_id: uuid.UUID = Depends(current_user_id),
                 session: AsyncSession = Depends(get_session)):
    user = await user_repo.get(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND")
    return _to_response(user, await session.get(UserSettings, user_id))


@router.patch("", response_model=MeResponse)
async def update_me(body: NicknameUpdate,
                    user_id: uuid.UUID = Depends(current_user_id),
                    session: AsyncSession = Depends(get_session)):
    if not await WeChatClient().check_text(body.nickname):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "NICKNAME_REJECTED")
    user = await user_repo.get(session, user_id)
    user.nickname = body.nickname
    await session.commit()
    return _to_response(user, await session.get(UserSettings, user_id))


@router.put("/settings", response_model=SettingsPayload)
async def update_settings(body: SettingsPayload,
                          user_id: uuid.UUID = Depends(current_user_id),
                          session: AsyncSession = Depends(get_session)):
    s = await session.get(UserSettings, user_id)
    s.bedtime, s.wake_time = body.bedtime, body.wake_time
    s.timezone, s.reduced_motion = body.timezone, body.reduced_motion
    await session.commit()
    return body


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(user_id: uuid.UUID = Depends(current_user_id),
                         session: AsyncSession = Depends(get_session)):
    """注销：物理删除全部数据，依赖 ON DELETE CASCADE。"""
    user = await user_repo.get(session, user_id)
    if user is not None:
        await session.delete(user)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

在 `api/v1/__init__.py` 注册 `me.router`。

- [ ] **Step 5: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_me_api.py -v`
Expected: 5 passed

- [ ] **Step 6: 交付检查**

建议 commit message：`feat(me): 用户资料、设置与注销（物理删除）`

---

### Task 6: 完成仪式（幂等 + 服务端权威）★

**Files:**
- Create: `backend/app/repositories/night.py`
- Create: `backend/app/services/ritual.py`
- Create: `backend/app/schemas/night.py`
- Create: `backend/app/api/v1/nights.py`
- Modify: `backend/app/api/v1/__init__.py`
- Create: `backend/tests/test_ritual_api.py`

**Interfaces:**
- Consumes: `ritual.evaluate_completion`, `ritual.current_ritual_night`, `ritual.calculate_on_time_streak`（Task 1）; `encrypt_list`（Task 3）; `NightRecord`（Task 2）
- Produces: `RitualService.complete(session, user_id, body: CompleteRequest, config: RitualConfig) -> tuple[NightRecord, int]`（返回夜记与截至该仪式夜的连续天数）
- Produces: `POST /api/v1/nights/complete`
- Produces: `CompleteRequest(completed_at, gratitudes, plans, resistance_reason)`, `CompleteResponse(ritual_date, is_eligible, late_minutes, streak)`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_ritual_api.py`:

```python
import asyncio
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.main import create_app
from app.models import NightRecord


@pytest.fixture
async def auth_client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await c.post("/api/v1/auth/wx-login", json={"code": "ritual"})).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    return c


async def test_complete_on_time(auth_client):
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:59:00+08:00",
        "gratitudes": ["感谢今天的阳光"], "plans": ["早点起"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body == {"ritual_date": "2026-08-27", "is_eligible": True,
                    "late_minutes": 29, "streak": 1}


async def test_complete_outside_window_still_creates_record(auth_client, session):
    """窗口外完成仍产生夜记，只是不合格（spec 修正 3）。"""
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T17:30:00+08:00", "gratitudes": [], "plans": [],
    })
    assert r.status_code == 200
    assert r.json()["is_eligible"] is False
    assert r.json()["streak"] == 0
    assert await session.scalar(select(func.count()).select_from(NightRecord)) == 1


async def test_repeat_completion_is_idempotent(auth_client, session):
    payload = {"completed_at": "2026-08-27T23:59:00+08:00",
               "gratitudes": ["第一次"], "plans": []}
    first = (await auth_client.post("/api/v1/nights/complete", json=payload)).json()
    payload["gratitudes"] = ["第二次"]
    second = (await auth_client.post("/api/v1/nights/complete", json=payload)).json()

    assert first == second                                   # 200 + 既有数据，不是 409
    assert await session.scalar(select(func.count()).select_from(NightRecord)) == 1


async def test_concurrent_completion_creates_one_record(auth_client, session):
    """并发请求下唯一约束是最终防线。"""
    payload = {"completed_at": "2026-08-27T23:59:00+08:00", "gratitudes": [], "plans": []}
    results = await asyncio.gather(
        auth_client.post("/api/v1/nights/complete", json=payload),
        auth_client.post("/api/v1/nights/complete", json=payload),
        return_exceptions=True,
    )
    assert all(getattr(r, "status_code", None) == 200 for r in results)
    assert await session.scalar(select(func.count()).select_from(NightRecord)) == 1


async def test_client_cannot_forge_eligibility(auth_client):
    """请求体带判定字段直接 422——拒绝比静默忽略更安全，客户端能立刻发现传错了。"""
    r = await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T17:30:00+08:00",
        "gratitudes": [], "plans": [],
        "is_eligible": True, "late_minutes": 0, "streak": 99,
    })
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"


async def test_text_is_encrypted_at_rest(auth_client, session):
    await auth_client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:59:00+08:00",
        "gratitudes": ["这句话不能明文出现在库里"], "plans": [],
    })
    row = (await session.scalars(select(NightRecord))).first()
    assert row.gratitudes_enc is not None
    assert "这句话不能明文出现在库里".encode() not in bytes(row.gratitudes_enc)
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ritual_api.py -v`
Expected: FAIL — 404

- [ ] **Step 3: 写 repositories/night.py**

```python
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NightRecord


async def insert_if_absent(session: AsyncSession, values: dict) -> None:
    """并发安全的写入：冲突则不插入。正确性由唯一约束保证。"""
    await session.execute(
        insert(NightRecord).values(**values).on_conflict_do_nothing(
            index_elements=["user_id", "ritual_date"]
        )
    )


async def get(session: AsyncSession, user_id: uuid.UUID, ritual_date: date) -> NightRecord | None:
    return await session.scalar(
        select(NightRecord).where(NightRecord.user_id == user_id,
                                  NightRecord.ritual_date == ritual_date)
    )


async def list_eligibility(session: AsyncSession, user_id: uuid.UUID,
                           until: date) -> list[tuple[date, bool]]:
    """截至 until 的 (仪式夜, 是否合格) 序列，供连续天数计算。"""
    rows = await session.execute(
        select(NightRecord.ritual_date, NightRecord.is_eligible)
        .where(NightRecord.user_id == user_id, NightRecord.ritual_date <= until)
        .order_by(NightRecord.ritual_date)
    )
    return [(d, e) for d, e in rows.all()]
```

- [ ] **Step 4: 写 schemas/night.py**

```python
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CompleteRequest(BaseModel):
    # forbid：客户端若尝试传 is_eligible 等判定字段，直接 422
    model_config = ConfigDict(extra="forbid")

    completed_at: datetime
    gratitudes: list[str] = Field(default_factory=list, max_length=10)
    plans: list[str] = Field(default_factory=list, max_length=10)
    resistance_reason: str | None = Field(default=None, max_length=128)


class CompleteResponse(BaseModel):
    ritual_date: date
    is_eligible: bool
    late_minutes: int
    streak: int
```

> `extra="forbid"` 使客户端传入 `is_eligible` 等判定字段时直接 422。
> 这比静默忽略更安全：客户端能立刻发现自己传错了，而不是以为服务端采纳了。

- [ ] **Step 5: 写 services/ritual.py**

```python
import uuid
from dataclasses import dataclass
from datetime import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_list
from app.domain import ritual as domain
from app.models import UserSettings
from app.repositories import night as night_repo
from app.schemas.night import CompleteRequest


@dataclass(frozen=True)
class RitualConfig:
    tolerance_minutes: int = 30
    min_time: time = time(20, 0)
    max_time: time = time(2, 0)


class RitualService:
    async def complete(self, session: AsyncSession, user_id: uuid.UUID,
                       body: CompleteRequest, config: RitualConfig):
        s: UserSettings = await session.get(UserSettings, user_id)

        # 服务端权威：用用户设置重算，不接受客户端任何判定结果
        assessment = domain.evaluate_completion(
            planned_time=s.bedtime,
            completed_at=body.completed_at,
            tz=s.timezone,
            tolerance_minutes=config.tolerance_minutes,
            min_time=config.min_time,
            max_time=config.max_time,
        )

        await night_repo.insert_if_absent(session, {
            "user_id": user_id,
            "ritual_date": assessment.ritual_date,
            "planned_at": assessment.planned_at,
            "completed_at": assessment.completed_at,
            "late_minutes": assessment.late_minutes,
            "is_eligible": assessment.eligible,
            "resistance_reason": body.resistance_reason,
            "gratitudes_enc": encrypt_list(body.gratitudes),
            "plans_enc": encrypt_list(body.plans),
        })
        await session.commit()

        record = await night_repo.get(session, user_id, assessment.ritual_date)
        history = await night_repo.list_eligibility(session, user_id, record.ritual_date)
        streak = domain.calculate_on_time_streak(history, record.ritual_date)
        return record, streak
```

- [ ] **Step 6: 写 api/v1/nights.py**

```python
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.schemas.night import CompleteRequest, CompleteResponse
from app.services.ritual import RitualConfig, RitualService

router = APIRouter(prefix="/nights", tags=["nights"])


@router.post("/complete", response_model=CompleteResponse)
async def complete(body: CompleteRequest,
                   user_id: uuid.UUID = Depends(current_user_id),
                   session: AsyncSession = Depends(get_session)):
    record, streak = await RitualService().complete(session, user_id, body, RitualConfig())
    return CompleteResponse(
        ritual_date=record.ritual_date, is_eligible=record.is_eligible,
        late_minutes=record.late_minutes, streak=streak,
    )
```

在 `api/v1/__init__.py` 注册 `nights.router`。

- [ ] **Step 7: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ritual_api.py -v`
Expected: 6 passed

- [ ] **Step 8: 交付检查**

建议 commit message：
```
feat(ritual): 完成仪式接口，服务端权威判定 + 数据库级幂等

判定一律由服务端用 user_settings 重算，请求体拒绝任何判定字段；
并发写入由 UNIQUE(user_id, ritual_date) 兜底；正文加密入库。
```

---

### Task 7: 夜记查询与编辑

**Files:**
- Modify: `backend/app/repositories/night.py`, `backend/app/schemas/night.py`, `backend/app/api/v1/nights.py`
- Create: `backend/tests/test_record_edit.py`

**Interfaces:**
- Consumes: `decrypt_list`, `DecryptError`（Task 3）; `ritual.reveal_window_opens_at`（Task 1）
- Produces: `GET /api/v1/nights`, `GET /api/v1/nights/{ritual_date}`, `PATCH /api/v1/nights/{ritual_date}`
- Produces: `NightSummary(ritual_date, is_eligible, late_minutes, completed_at)`, `NightDetail(... , gratitudes, plans, text_available)`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_record_edit.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
async def auth_client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await c.post("/api/v1/auth/wx-login", json={"code": "edit"})).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    await c.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:59:00+08:00",
        "gratitudes": ["原始内容"], "plans": ["原始计划"],
    })
    return c


async def test_detail_decrypts_text(auth_client):
    body = (await auth_client.get("/api/v1/nights/2026-08-27")).json()
    assert body["gratitudes"] == ["原始内容"]
    assert body["text_available"] is True


async def test_list_excludes_text(auth_client):
    items = (await auth_client.get("/api/v1/nights")).json()["items"]
    assert len(items) == 1
    assert "gratitudes" not in items[0] and "plans" not in items[0]


async def test_edit_before_reveal_window(auth_client, monkeypatch):
    """仪式夜次日 06:00 之前可改（spec 修正 7）。"""
    monkeypatch.setattr("app.api.v1.nights._now",
                        lambda: __import__("datetime").datetime.fromisoformat("2026-08-28T05:00:00+08:00"))
    r = await auth_client.patch("/api/v1/nights/2026-08-27",
                                json={"gratitudes": ["改过的"], "plans": ["新计划"]})
    assert r.status_code == 200
    assert (await auth_client.get("/api/v1/nights/2026-08-27")).json()["gratitudes"] == ["改过的"]


async def test_edit_after_reveal_window_rejected(auth_client, monkeypatch):
    monkeypatch.setattr("app.api.v1.nights._now",
                        lambda: __import__("datetime").datetime.fromisoformat("2026-08-28T06:00:00+08:00"))
    r = await auth_client.patch("/api/v1/nights/2026-08-27",
                                json={"gratitudes": ["太晚了"], "plans": []})
    assert r.status_code == 409
    assert r.json()["code"] == "RECORD_LOCKED"


async def test_edit_does_not_change_eligibility(auth_client, monkeypatch, session):
    from sqlalchemy import select
    from app.models import NightRecord
    monkeypatch.setattr("app.api.v1.nights._now",
                        lambda: __import__("datetime").datetime.fromisoformat("2026-08-28T05:00:00+08:00"))
    before = (await session.scalars(select(NightRecord))).first()
    completed_before, eligible_before = before.completed_at, before.is_eligible

    await auth_client.patch("/api/v1/nights/2026-08-27",
                            json={"gratitudes": ["改了正文"], "plans": []})
    await session.refresh(before)
    assert before.completed_at == completed_before and before.is_eligible == eligible_before
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_record_edit.py -v`
Expected: FAIL — 404

- [ ] **Step 3: 扩充 schemas/night.py**

```python
class NightSummary(BaseModel):
    ritual_date: date
    is_eligible: bool
    late_minutes: int
    completed_at: datetime


class NightList(BaseModel):
    items: list[NightSummary]


class NightDetail(NightSummary):
    gratitudes: list[str]
    plans: list[str]
    resistance_reason: str | None
    text_available: bool          # 解密失败时为 False，元数据仍照常返回


class RecordTextUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gratitudes: list[str] = Field(default_factory=list, max_length=10)
    plans: list[str] = Field(default_factory=list, max_length=10)
```

- [ ] **Step 4: 扩充 repositories/night.py**

```python
async def list_range(session: AsyncSession, user_id: uuid.UUID,
                     start: date | None, end: date | None) -> list[NightRecord]:
    stmt = select(NightRecord).where(NightRecord.user_id == user_id)
    if start:
        stmt = stmt.where(NightRecord.ritual_date >= start)
    if end:
        stmt = stmt.where(NightRecord.ritual_date <= end)
    return list(await session.scalars(stmt.order_by(NightRecord.ritual_date.desc())))
```

- [ ] **Step 5: 扩充 api/v1/nights.py**

```python
from datetime import date as _date, datetime, timezone

from fastapi import HTTPException, Query, status

from app.core.crypto import DecryptError, decrypt_list, encrypt_list
from app.domain import ritual as domain
from app.models import UserSettings
from app.schemas.night import NightDetail, NightList, NightSummary, RecordTextUpdate


def _now() -> datetime:
    """独立函数，便于测试注入时间。业务判定不得直接调用 datetime.now()。"""
    return datetime.now(timezone.utc)


@router.get("", response_model=NightList)
async def list_nights(start: _date | None = Query(None, alias="from"),
                      end: _date | None = Query(None, alias="to"),
                      user_id: uuid.UUID = Depends(current_user_id),
                      session: AsyncSession = Depends(get_session)):
    rows = await night_repo.list_range(session, user_id, start, end)
    return NightList(items=[
        NightSummary(ritual_date=r.ritual_date, is_eligible=r.is_eligible,
                     late_minutes=r.late_minutes, completed_at=r.completed_at)
        for r in rows
    ])


@router.get("/{ritual_date}", response_model=NightDetail)
async def get_night(ritual_date: _date,
                    user_id: uuid.UUID = Depends(current_user_id),
                    session: AsyncSession = Depends(get_session)):
    r = await night_repo.get(session, user_id, ritual_date)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NIGHT_NOT_FOUND")
    try:
        gratitudes, plans, ok = decrypt_list(r.gratitudes_enc), decrypt_list(r.plans_enc), True
    except DecryptError:
        gratitudes, plans, ok = [], [], False     # 降级：元数据照常显示
    return NightDetail(
        ritual_date=r.ritual_date, is_eligible=r.is_eligible, late_minutes=r.late_minutes,
        completed_at=r.completed_at, gratitudes=gratitudes, plans=plans,
        resistance_reason=r.resistance_reason, text_available=ok,
    )


@router.patch("/{ritual_date}", response_model=NightDetail)
async def edit_night_text(ritual_date: _date, body: RecordTextUpdate,
                          user_id: uuid.UUID = Depends(current_user_id),
                          session: AsyncSession = Depends(get_session)):
    r = await night_repo.get(session, user_id, ritual_date)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NIGHT_NOT_FOUND")

    s: UserSettings = await session.get(UserSettings, user_id)
    if _now() >= domain.reveal_window_opens_at(ritual_date, s.timezone):
        raise HTTPException(status.HTTP_409_CONFLICT, "RECORD_LOCKED")

    # 只改正文；completed_at / is_eligible / late_minutes 一律不动
    r.gratitudes_enc = encrypt_list(body.gratitudes)
    r.plans_enc = encrypt_list(body.plans)
    await session.commit()
    return await get_night(ritual_date, user_id, session)
```

- [ ] **Step 6: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_record_edit.py -v`
Expected: 5 passed

- [ ] **Step 7: 交付检查**

建议 commit message：
```
feat(nights): 夜记查询与揭晓窗口前的正文编辑

列表不含正文；详情单条解密，失败时降级但保留元数据；
编辑只改正文，不影响完成时刻与按时资格。
```

---

### Task 8: 奖励揭晓（事务 + 历史连续天数）★

**Files:**
- Create: `backend/app/core/assets.py`
- Create: `backend/app/repositories/reward.py`, `backend/app/repositories/art.py`
- Create: `backend/app/services/reward.py`
- Create: `backend/app/schemas/reward.py`
- Create: `backend/app/api/v1/rewards.py`
- Modify: `backend/app/api/v1/__init__.py`
- Create: `backend/tests/test_reward_api.py`

**Interfaces:**
- Consumes: `ritual.can_reveal`, `ritual.calculate_on_time_streak`, `ritual.reward_draw_count`（Task 1）
- Produces: `RewardService.reveal_all(session, user_id, now) -> list[Reward]`
- Produces: `GET /api/v1/rewards/pending`, `POST /api/v1/rewards/reveal`
- Produces: `PendingResponse(revealable, ritual_dates)`, `RevealResponse(rewards)`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_reward_api.py`:

```python
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.main import create_app
from app.models import ArtWork, NightRecord, Reward

SH = timezone(timedelta(hours=8))


@pytest.fixture
async def ctx(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await c.post("/api/v1/auth/wx-login", json={"code": "rw"})).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    for i in range(3):
        session.add(ArtWork(
            id=f"art-{i}", title=f"作品{i}", artist="佚名", year="2026",
            thumbnail=f"art/{i}-thumb.jpg", image=f"art/{i}.jpg",
            alt=f"作品{i}", source="公共领域", article="文章正文",
        ))
    await session.flush()
    return c, session


async def _seed_nights(session, user_id, days: list[str], eligible=True):
    for d in days:
        session.add(NightRecord(
            user_id=user_id, ritual_date=date.fromisoformat(d),
            planned_at=datetime.fromisoformat(f"{d}T23:30:00+08:00"),
            completed_at=datetime.fromisoformat(f"{d}T23:45:00+08:00"),
            late_minutes=15, is_eligible=eligible,
        ))
    await session.flush()


async def _user_id(session):
    from app.models import User
    return (await session.scalars(select(User))).first().id


async def test_pending_empty_before_window(ctx, monkeypatch):
    c, session = ctx
    await _seed_nights(session, await _user_id(session), ["2026-08-27"])
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 28, 5, 59, tzinfo=SH))
    assert (await c.get("/api/v1/rewards/pending")).json()["revealable"] is False


async def test_pending_open_at_six(ctx, monkeypatch):
    c, session = ctx
    await _seed_nights(session, await _user_id(session), ["2026-08-27"])
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 28, 6, 0, tzinfo=SH))
    body = (await c.get("/api/v1/rewards/pending")).json()
    assert body["revealable"] is True and body["ritual_dates"] == ["2026-08-27"]


async def test_reveal_creates_rewards_and_is_idempotent(ctx, monkeypatch, ):
    c, session = ctx
    await _seed_nights(session, await _user_id(session), ["2026-08-27"])
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 28, 7, 0, tzinfo=SH))
    first = (await c.post("/api/v1/rewards/reveal")).json()["rewards"]
    assert len(first) == 1
    second = (await c.post("/api/v1/rewards/reveal")).json()["rewards"]
    assert second == []                                    # 不重抽
    assert await session.scalar(select(func.count()).select_from(Reward)) == 1


async def test_reveal_multiple_pending_nights(ctx, monkeypatch):
    """用户数日未打开，一次揭晓全部。"""
    c, session = ctx
    await _seed_nights(session, await _user_id(session), ["2026-08-25", "2026-08-26", "2026-08-27"])
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 29, 9, 0, tzinfo=SH))
    rewards = (await c.post("/api/v1/rewards/reveal")).json()["rewards"]
    # 3 晚连续：第 1、2 晚各 1 抽，第 3 晚（里程碑）2 抽
    assert len(rewards) == 4


async def test_draw_count_uses_streak_at_that_night(ctx, monkeypatch):
    """★ 断签后补揭晓，抽数仍按该仪式夜当时的连续天数。"""
    c, session = ctx
    uid = await _user_id(session)
    # 08-21..08-27 连续 7 晚（第 7 晚应得 2 抽），08-28 缺席
    await _seed_nights(session, uid, [f"2026-08-{d}" for d in range(21, 28)])
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 29, 9, 0, tzinfo=SH))
    rewards = (await c.post("/api/v1/rewards/reveal")).json()["rewards"]
    # 7 晚：第 3 晚 +1、第 7 晚 +1，其余各 1 → 7 + 2 = 9
    assert len(rewards) == 9

    row = await session.scalar(
        select(NightRecord).where(NightRecord.ritual_date == date(2026, 8, 27)))
    assert row.reward_draw_count == 2      # 而非按揭晓时刻（已断签）算出的 1


async def test_ineligible_night_gets_no_reward(ctx, monkeypatch):
    c, session = ctx
    await _seed_nights(session, await _user_id(session), ["2026-08-27"], eligible=False)
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 29, 9, 0, tzinfo=SH))
    assert (await c.post("/api/v1/rewards/reveal")).json()["rewards"] == []


async def test_withdrawn_art_excluded_from_pool(ctx, monkeypatch, session):
    c, session = ctx
    for row in (await session.scalars(select(ArtWork))).all():
        row.is_withdrawn = True
    await session.flush()
    await _seed_nights(session, await _user_id(session), ["2026-08-27"])
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 29, 9, 0, tzinfo=SH))
    assert (await c.post("/api/v1/rewards/reveal")).json()["rewards"] == []
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_reward_api.py -v`
Expected: FAIL — 404

- [ ] **Step 3: 写 core/assets.py**

图片 URL 的拼装在 rewards 与 art 两处都要用，提取到公共模块，避免跨路由导入私有函数。

`backend/app/core/assets.py`:

```python
from app.core.config import get_settings
from app.models import ArtWork
from app.schemas.reward import ArtBrief


def asset_url(relative_path: str) -> str:
    """数据库存相对路径，出口拼 ASSET_BASE_URL。

    迁到对象存储时只改环境变量，数据库一行不动。
    """
    return f"{get_settings().asset_base_url.rstrip('/')}/{relative_path.lstrip('/')}"


def art_brief(art: ArtWork) -> ArtBrief:
    return ArtBrief(
        id=art.id, title=art.title, artist=art.artist, year=art.year,
        thumbnail=asset_url(art.thumbnail), image=asset_url(art.image), alt=art.alt,
    )
```

- [ ] **Step 4: 写 repositories/art.py 与 reward.py**

`backend/app/repositories/art.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ArtWork


async def active_pool(session: AsyncSession) -> list[ArtWork]:
    """抽卡池：已上架且未撤回。"""
    return list(await session.scalars(
        select(ArtWork).where(ArtWork.is_active.is_(True),
                              ArtWork.is_withdrawn.is_(False))
        .order_by(ArtWork.id)
    ))


async def get_visible(session: AsyncSession, art_id: str) -> ArtWork | None:
    """已收藏用户可读：下架仍可见，撤回不可见。"""
    art = await session.get(ArtWork, art_id)
    return None if art is None or art.is_withdrawn else art
```

`backend/app/repositories/reward.py`:

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NightRecord, Reward


async def pending_nights(session: AsyncSession, user_id: uuid.UUID) -> list[NightRecord]:
    """合格且尚未揭晓的夜记，按仪式夜升序。"""
    return list(await session.scalars(
        select(NightRecord)
        .where(NightRecord.user_id == user_id,
               NightRecord.is_eligible.is_(True),
               NightRecord.reward_revealed_at.is_(None))
        .order_by(NightRecord.ritual_date)
        .with_for_update()          # 事务内锁行，防并发重复揭晓
    ))


async def list_art_ids(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    return list(await session.scalars(
        select(Reward.art_id).where(Reward.user_id == user_id).order_by(Reward.awarded_at)
    ))
```

- [ ] **Step 5: 写 services/reward.py**

```python
import secrets
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import ritual as domain
from app.models import Reward, UserSettings
from app.repositories import art as art_repo
from app.repositories import night as night_repo
from app.repositories import reward as reward_repo

_rng = secrets.SystemRandom()


class RewardService:
    async def reveal_all(self, session: AsyncSession, user_id: uuid.UUID,
                         now: datetime) -> list[Reward]:
        s: UserSettings = await session.get(UserSettings, user_id)
        pool = await art_repo.active_pool(session)
        created: list[Reward] = []

        for night in await reward_repo.pending_nights(session, user_id):
            if not domain.can_reveal(ritual_date=night.ritual_date,
                                     is_eligible=night.is_eligible,
                                     reward_revealed_at=night.reward_revealed_at,
                                     now=now, tz=s.timezone):
                continue
            if not pool:
                continue

            # ★ 用「该仪式夜当时」的连续天数，不是揭晓时刻的
            history = await night_repo.list_eligibility(session, user_id, night.ritual_date)
            streak = domain.calculate_on_time_streak(history, night.ritual_date)
            draws = domain.reward_draw_count(streak)

            for _ in range(draws):
                art = _rng.choice(pool)          # 允许重复抽中同一幅
                reward = Reward(user_id=user_id, night_record_id=night.id, art_id=art.id)
                session.add(reward)
                created.append(reward)

            night.reward_revealed_at = now
            night.reward_draw_count = draws

        await session.commit()
        return created
```

- [ ] **Step 6: 写 schemas/reward.py 与 api/v1/rewards.py**

`backend/app/schemas/reward.py`:

```python
from datetime import date, datetime

from pydantic import BaseModel


class ArtBrief(BaseModel):
    id: str
    title: str
    artist: str
    year: str
    thumbnail: str          # 已拼 ASSET_BASE_URL
    image: str
    alt: str


class RewardItem(BaseModel):
    art: ArtBrief
    awarded_at: datetime


class PendingResponse(BaseModel):
    revealable: bool
    ritual_dates: list[date]


class RevealResponse(BaseModel):
    rewards: list[RewardItem]
```

`backend/app/api/v1/rewards.py`:

```python
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.assets import art_brief
from app.core.db import get_session
from app.core.security import current_user_id
from app.domain import ritual as domain
from app.models import ArtWork, UserSettings
from app.repositories import reward as reward_repo
from app.schemas.reward import PendingResponse, RevealResponse, RewardItem
from app.services.reward import RewardService

router = APIRouter(prefix="/rewards", tags=["rewards"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/pending", response_model=PendingResponse)
async def pending(user_id: uuid.UUID = Depends(current_user_id),
                  session: AsyncSession = Depends(get_session)):
    s: UserSettings = await session.get(UserSettings, user_id)
    now = _now()
    dates = [n.ritual_date for n in await reward_repo.pending_nights(session, user_id)
             if domain.can_reveal(ritual_date=n.ritual_date, is_eligible=n.is_eligible,
                                  reward_revealed_at=n.reward_revealed_at,
                                  now=now, tz=s.timezone)]
    return PendingResponse(revealable=bool(dates), ritual_dates=dates)


@router.post("/reveal", response_model=RevealResponse)
async def reveal(user_id: uuid.UUID = Depends(current_user_id),
                 session: AsyncSession = Depends(get_session)):
    rewards = await RewardService().reveal_all(session, user_id, _now())
    items = []
    for r in rewards:
        art = await session.get(ArtWork, r.art_id)
        items.append(RewardItem(art=art_brief(art), awarded_at=r.awarded_at))
    return RevealResponse(rewards=items)
```

在 `api/v1/__init__.py` 注册 `rewards.router`。

- [ ] **Step 7: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_reward_api.py -v`
Expected: 7 passed

- [ ] **Step 8: 交付检查**

建议 commit message：
```
feat(rewards): 次日揭晓，事务保证幂等

一次揭晓全部到窗口的夜记；抽卡次数按该仪式夜当时的连续天数计算，
不受揭晓时刻已断签影响；撤回的作品不进抽卡池。
```

---

### Task 9: 收藏与作品详情

**Files:**
- Create: `backend/app/api/v1/art.py`
- Modify: `backend/app/api/v1/__init__.py`, `backend/app/schemas/reward.py`
- Create: `backend/tests/test_collection_api.py`

**Interfaces:**
- Consumes: `ritual.summarize_collection`（Task 1）, `art_repo.get_visible`（Task 8）
- Produces: `GET /api/v1/collection`, `GET /api/v1/art/{art_id}`
- Produces: `CollectionResponse(total_cards, unique_works, items)`, `CollectionItem(art, count)`, `ArtDetail`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_collection_api.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import create_app
from app.models import ArtWork, NightRecord, Reward, User


@pytest.fixture
async def ctx(session):
    from datetime import date, datetime, timedelta, timezone
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await c.post("/api/v1/auth/wx-login", json={"code": "col"})).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"

    user = (await session.scalars(select(User))).first()
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
        late_minutes=15, is_eligible=True,
    )
    session.add(night)
    await session.flush()
    session.add_all([
        Reward(user_id=user.id, night_record_id=night.id, art_id="a"),
        Reward(user_id=user.id, night_record_id=night.id, art_id="a"),
        Reward(user_id=user.id, night_record_id=night.id, art_id="b"),
    ])
    await session.flush()
    return c, session


async def test_collection_counts_cards_and_unique_works(ctx):
    c, _ = ctx
    body = (await c.get("/api/v1/collection")).json()
    assert body["total_cards"] == 3
    assert body["unique_works"] == 2
    counts = {i["art"]["id"]: i["count"] for i in body["items"]}
    assert counts == {"a": 2, "b": 1}


async def test_asset_urls_are_absolute(ctx):
    c, _ = ctx
    body = (await c.get("/api/v1/collection")).json()
    assert body["items"][0]["art"]["thumbnail"].startswith("http")


async def test_deactivated_art_still_visible_in_collection(ctx):
    """下架只影响抽卡池，已收藏仍可见。"""
    c, session = ctx
    (await session.get(ArtWork, "a")).is_active = False
    await session.flush()
    body = (await c.get("/api/v1/collection")).json()
    assert body["unique_works"] == 2
    assert (await c.get("/api/v1/art/a")).status_code == 200


async def test_withdrawn_art_is_gone(ctx):
    """撤回后连已收藏用户也不可见。"""
    c, session = ctx
    (await session.get(ArtWork, "a")).is_withdrawn = True
    await session.flush()
    assert (await c.get("/api/v1/art/a")).status_code == 410


async def test_art_detail_includes_article(ctx):
    c, _ = ctx
    body = (await c.get("/api/v1/art/b")).json()
    assert body["article"] == "文章 B" and body["source"] == "公共领域"
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_collection_api.py -v`
Expected: FAIL — 404

- [ ] **Step 3: 扩充 schemas/reward.py**

```python
class CollectionItem(BaseModel):
    art: ArtBrief
    count: int


class CollectionResponse(BaseModel):
    total_cards: int
    unique_works: int
    items: list[CollectionItem]


class ArtDetail(ArtBrief):
    source: str
    article: str
```

- [ ] **Step 4: 写 api/v1/art.py**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.domain import ritual as domain
from app.models import ArtWork
from app.repositories import art as art_repo
from app.repositories import reward as reward_repo
from app.core.assets import art_brief
from app.schemas.reward import ArtDetail, CollectionItem, CollectionResponse

router = APIRouter(tags=["art"])


@router.get("/collection", response_model=CollectionResponse)
async def collection(user_id: uuid.UUID = Depends(current_user_id),
                     session: AsyncSession = Depends(get_session)):
    art_ids = await reward_repo.list_art_ids(session, user_id)
    summary = domain.summarize_collection(art_ids)

    items = []
    for art_id, count in summary.counts.items():
        art = await art_repo.get_visible(session, art_id)
        if art is not None:                       # 撤回的作品从收藏中隐去
            items.append(CollectionItem(art=art_brief(art), count=count))
    return CollectionResponse(total_cards=summary.total_cards,
                              unique_works=summary.unique_works, items=items)


@router.get("/art/{art_id}", response_model=ArtDetail)
async def art_detail(art_id: str, _: uuid.UUID = Depends(current_user_id),
                     session: AsyncSession = Depends(get_session)):
    art: ArtWork | None = await session.get(ArtWork, art_id)
    if art is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ART_NOT_FOUND")
    if art.is_withdrawn:
        raise HTTPException(status.HTTP_410_GONE, "ART_WITHDRAWN")
    brief = art_brief(art)
    return ArtDetail(**brief.model_dump(), source=art.source, article=art.article)
```

> `test_withdrawn_art_is_gone` 断言 `unique_works` 仍按奖励记录统计（3 张 / 2 幅），
> 但 `items` 中不含被撤回的作品。这是刻意的：统计反映用户实际获得过什么，
> 展示则受撤回约束。

- [ ] **Step 5: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_collection_api.py -v`
Expected: 5 passed

- [ ] **Step 6: 交付检查**

建议 commit message：`feat(collection): 收藏统计与作品详情，区分下架与撤回`

---

### Task 10: 运营配置、匿名事件与 Redis

**Files:**
- Create: `backend/app/core/redis.py`
- Create: `backend/app/domain/config.py`
- Create: `backend/app/schemas/config.py`
- Create: `backend/app/api/v1/config.py`, `backend/app/api/v1/events.py`
- Modify: `backend/app/api/v1/__init__.py`
- Create: `backend/tests/test_config_api.py`, `backend/tests/test_events_api.py`

**Interfaces:**
- Consumes: `AnalyticsEvent`（Task 2）, `current_user_id`（Task 4）, `RitualConfig`（Task 6）
- Produces: `DEFAULT_CONFIG: RuntimeConfig`（`app.domain.config`）
- Produces: `get_redis() -> Redis | None`（Redis 不可用时返回 None，调用方降级）
- Produces: `GET /api/v1/config`, `POST /api/v1/events`
- Produces: `EventBatch(events: list[EventItem])`, `EventItem(type, payload, occurred_at)`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_config_api.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_config_exposes_ritual_parameters(client):
    body = (await client.get("/api/v1/config")).json()
    assert body["schedule"]["bedtime"] == "23:30"
    assert body["schedule"]["min_time"] == "20:00"
    assert body["schedule"]["max_time"] == "02:00"
    assert body["ritual"]["tolerance_minutes"] == 30


async def test_config_is_public(client):
    """未登录也能拿到配置——小程序启动即需要。"""
    assert (await client.get("/api/v1/config")).status_code == 200


async def test_config_never_leaks_secrets(client):
    text = (await client.get("/api/v1/config")).text.lower()
    for leak in ("fernet", "jwt_secret", "secret", "password", "appid", "database"):
        assert leak not in text
```

`backend/tests/test_events_api.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import create_app
from app.models import AnalyticsEvent


@pytest.fixture
async def auth_client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await c.post("/api/v1/auth/wx-login", json={"code": "ev"})).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    return c


async def test_batch_events_stored(auth_client, session):
    r = await auth_client.post("/api/v1/events", json={"events": [
        {"type": "ritual_completed", "payload": {"eligible": True},
         "occurred_at": "2026-08-27T23:59:00+08:00"},
        {"type": "reward_revealed", "payload": {"draws": 2},
         "occurred_at": "2026-08-28T07:00:00+08:00"},
    ]})
    assert r.status_code == 202
    rows = (await session.scalars(select(AnalyticsEvent))).all()
    assert {row.type for row in rows} == {"ritual_completed", "reward_revealed"}


async def test_payload_with_forbidden_keys_is_rejected(auth_client, session):
    """正文绝不可进入匿名事件（spec 第八节）。"""
    r = await auth_client.post("/api/v1/events", json={"events": [
        {"type": "ritual_completed",
         "payload": {"gratitudes": ["不该出现在这里"]},
         "occurred_at": "2026-08-27T23:59:00+08:00"},
    ]})
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"
    assert (await session.scalars(select(AnalyticsEvent))).all() == []


async def test_batch_size_capped(auth_client):
    events = [{"type": "t", "payload": {}, "occurred_at": "2026-08-27T23:59:00+08:00"}] * 201
    assert (await auth_client.post("/api/v1/events", json={"events": events})).status_code == 422
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config_api.py tests/test_events_api.py -v`
Expected: FAIL — 404

- [ ] **Step 3: 写 core/redis.py**

```python
"""Redis 客户端。

Redis 是优化，不是正确性依赖：完成仪式的幂等由 UNIQUE(user_id, ritual_date) 保证，
揭晓的幂等由 SELECT ... FOR UPDATE 保证。Redis 整体不可用时服务应变慢但不出错，
因此所有取用点都必须能接受 None。
"""

import logging

from redis.asyncio import Redis

from app.core.config import get_settings

logger = logging.getLogger("zhusheng")
_client: Redis | None = None


def get_redis() -> Redis | None:
    global _client
    if _client is None:
        s = get_settings()
        try:
            _client = Redis(
                host=s.redis_host, port=s.redis_port, db=s.redis_db,
                password=s.redis_password or None, decode_responses=True,
                socket_connect_timeout=2, socket_timeout=2,
            )
        except Exception:
            logger.warning("Redis 初始化失败，降级运行")
            return None
    return _client


def key(*parts: str) -> str:
    """统一前缀，避免与同一 REDIS_DB 中其他项目撞 key。"""
    return get_settings().redis_prefix + ":".join(parts)
```

- [ ] **Step 4: 写 domain/config.py**

阶段一运营配置为常量；阶段三接入后台后改为查库 + Redis 缓存，接口形状不变。

```python
"""运营配置。阶段一为常量，阶段三改为查库 + Redis 缓存，对外形状不变。"""

from dataclasses import dataclass, field
from datetime import time


@dataclass(frozen=True)
class ScheduleConfig:
    bedtime: time = time(23, 30)
    wake_time: time = time(7, 30)
    min_time: time = time(20, 0)      # 资格窗口下界
    max_time: time = time(2, 0)       # 资格窗口上界（跨午夜）


@dataclass(frozen=True)
class RitualConfigValues:
    tolerance_minutes: int = 30
    gratitude_count: int = 3
    plan_count: int = 3
    resistance_options: tuple[str, ...] = (
        "我还在刷手机", "我还在工作", "我还不困", "我舍不得结束今天",
    )


@dataclass(frozen=True)
class RuntimeConfig:
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)
    ritual: RitualConfigValues = field(default_factory=RitualConfigValues)


DEFAULT_CONFIG = RuntimeConfig()
```

- [ ] **Step 5: 写 schemas/config.py 与两个路由**

`backend/app/schemas/config.py`:

```python
from datetime import datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

# 与 core/errors.py 的 SENSITIVE_KEYS 对齐：这些键绝不可出现在匿名事件里
FORBIDDEN_PAYLOAD_KEYS = {"gratitudes", "plans", "openid", "session_key",
                          "nickname", "avatar_url", "text", "content"}


class SchedulePayload(BaseModel):
    bedtime: time
    wake_time: time
    min_time: time
    max_time: time

    @field_serializer("bedtime", "wake_time", "min_time", "max_time")
    def _hhmm(self, v: time) -> str:
        return v.strftime("%H:%M")


class RitualPayload(BaseModel):
    tolerance_minutes: int
    gratitude_count: int
    plan_count: int
    resistance_options: list[str]


class ConfigResponse(BaseModel):
    schedule: SchedulePayload
    ritual: RitualPayload


class EventItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime

    @field_validator("payload")
    @classmethod
    def _no_private_text(cls, v: dict) -> dict:
        leaked = FORBIDDEN_PAYLOAD_KEYS & set(v)
        if leaked:
            raise ValueError(f"匿名事件不得包含私人内容字段：{sorted(leaked)}")
        return v


class EventBatch(BaseModel):
    events: list[EventItem] = Field(min_length=1, max_length=200)
```

`backend/app/api/v1/config.py`:

```python
from fastapi import APIRouter

from app.domain.config import DEFAULT_CONFIG
from app.schemas.config import ConfigResponse, RitualPayload, SchedulePayload

router = APIRouter(tags=["config"])


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """公开接口：小程序启动即需要，不要求登录。"""
    c = DEFAULT_CONFIG
    return ConfigResponse(
        schedule=SchedulePayload(bedtime=c.schedule.bedtime, wake_time=c.schedule.wake_time,
                                 min_time=c.schedule.min_time, max_time=c.schedule.max_time),
        ritual=RitualPayload(tolerance_minutes=c.ritual.tolerance_minutes,
                             gratitude_count=c.ritual.gratitude_count,
                             plan_count=c.ritual.plan_count,
                             resistance_options=list(c.ritual.resistance_options)),
    )
```

`backend/app/api/v1/events.py`:

```python
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.models import AnalyticsEvent
from app.schemas.config import EventBatch

router = APIRouter(tags=["events"])


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_events(body: EventBatch,
                        user_id: uuid.UUID = Depends(current_user_id),
                        session: AsyncSession = Depends(get_session)):
    session.add_all([
        AnalyticsEvent(user_id=user_id, type=e.type, payload=e.payload, created_at=e.occurred_at)
        for e in body.events
    ])
    await session.commit()
    return Response(status_code=status.HTTP_202_ACCEPTED)
```

在 `api/v1/__init__.py` 注册 `config.router` 与 `events.router`。

- [ ] **Step 6: 让 RitualService 使用 DEFAULT_CONFIG**

把 Task 6 中 `api/v1/nights.py` 里硬编码的 `RitualConfig()` 换成来自配置的值：

```python
from app.domain.config import DEFAULT_CONFIG
from app.services.ritual import RitualConfig

def _ritual_config() -> RitualConfig:
    c = DEFAULT_CONFIG
    return RitualConfig(tolerance_minutes=c.ritual.tolerance_minutes,
                        min_time=c.schedule.min_time, max_time=c.schedule.max_time)
```

`complete()` 中改为 `await RitualService().complete(session, user_id, body, _ritual_config())`。

- [ ] **Step 7: 运行测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_config_api.py tests/test_events_api.py tests/test_ritual_api.py -v`
Expected: 全部 PASS

- [ ] **Step 8: 验证 Redis 不可用时服务仍正确**

Run:
```bash
cd backend && REDIS_HOST=127.0.0.1 REDIS_PORT=1 .venv/bin/python -m pytest tests/test_ritual_api.py tests/test_reward_api.py -v
```
Expected: 全部 PASS —— Redis 连不上不得影响幂等与判定的正确性。

- [ ] **Step 9: 交付检查**

建议 commit message：
```
feat(config,events): 运营配置与匿名事件接口，接入 Redis

配置阶段一为常量，形状与阶段三接后台后一致；
匿名事件在 schema 层拒收正文字段；Redis 全程可降级。
```

---

### Task 11: 统一错误信封、日志脱敏与静态托管

**Files:**
- Create: `backend/app/core/errors.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_errors.py`

**Interfaces:**
- Produces: `register_exception_handlers(app: FastAPI) -> None`
- Produces: 错误响应体 `{"code": str, "message": str, "detail": dict | None}`

- [ ] **Step 1: 写失败的测试**

`backend/tests/test_errors.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_error_envelope_shape(client):
    r = await client.get("/api/v1/me")           # 未带 token
    assert r.status_code == 401
    body = r.json()
    assert set(body) >= {"code", "message"}
    assert body["code"] == "TOKEN_MISSING"


async def test_error_never_leaks_internals(client):
    r = await client.get("/api/v1/me")
    text = r.text.lower()
    for leak in ("traceback", "postgresql://", "asyncpg", "select ", "password"):
        assert leak not in text


async def test_validation_error_uses_envelope(client):
    r = await client.post("/api/v1/auth/wx-login", json={})
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_ERROR"


async def test_static_mount_serves_assets(client, tmp_path):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
```

- [ ] **Step 2: 运行测试，确认 RED**

Run: `cd backend && .venv/bin/python -m pytest tests/test_errors.py -v`
Expected: FAIL — 响应体是 FastAPI 默认的 `{"detail": ...}`，无 `code` 字段

- [ ] **Step 3: 写 errors.py**

```python
import logging
import uuid

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("zhusheng")

# 绝不可进入日志的字段
SENSITIVE_KEYS = {"gratitudes", "plans", "openid", "session_key",
                  "gratitudes_enc", "plans_enc", "access_token", "refresh_token"}


def scrub(data: dict) -> dict:
    return {k: ("***" if k in SENSITIVE_KEYS else v) for k, v in data.items()}


def _envelope(code: str, message: str, detail=None) -> dict:
    body = {"code": code, "message": message}
    if detail is not None:
        body["detail"] = detail
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException):
        # 约定：detail 传错误码字符串
        code = exc.detail if isinstance(exc.detail, str) else "HTTP_ERROR"
        return JSONResponse(status_code=exc.status_code,
                            content=_envelope(code, code))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("VALIDATION_ERROR", "请求参数不合法", {"fields": fields}),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        request_id = uuid.uuid4().hex
        # 记全栈到日志，但响应体绝不含堆栈、SQL 或连接串
        logger.exception("unhandled error request_id=%s path=%s", request_id, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("INTERNAL_ERROR", "服务器内部错误", {"request_id": request_id}),
        )
```

- [ ] **Step 4: 在 main.py 装配并挂载静态目录**

```python
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from app.core.errors import register_exception_handlers


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="烛生 API", version="0.1.0")

    register_exception_handlers(app)

    from app.api.v1 import api_router
    app.include_router(api_router)

    # 开发期图片托管；上线后改 ASSET_BASE_URL 指向对象存储即可，数据库不动
    static_dir = Path(__file__).resolve().parent.parent / "static"
    static_dir.mkdir(exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/health")
    async def health():
        return {"status": "ok", "env": settings.env}

    return app
```

- [ ] **Step 5: 运行全部测试，确认 GREEN**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS

- [ ] **Step 6: 交付检查**

建议 commit message：
```
feat(errors): 统一错误信封与日志脱敏，挂载静态资源目录
```

---

### Task 12: 灌入 10 幅作品

**Files:**
- Create: `backend/scripts/seed_art.py`
- Create: `backend/scripts/art_seed_data.py`
- Create: `backend/static/art/`（图片文件）
- Create: `backend/tests/test_seed.py`

**Interfaces:**
- Consumes: `ArtWork`（Task 2）
- Produces: `ART_SEED: list[dict]`（10 条完整元数据）
- Produces: `python -m scripts.seed_art` 幂等灌库

- [ ] **Step 1: 起草 10 幅作品的元数据与文章**

`backend/scripts/art_seed_data.py`。**全部为公共领域画作，`source` 必须写明确切出处**
（spec 已标注原型的 `source` 自带 TODO，是上线风险）。每条格式：

```python
ART_SEED = [
    {
        "id": "monet-water-lilies",
        "title": "睡莲",
        "artist": "克劳德·莫奈",
        "year": "约 1916–1919",
        "thumbnail": "art/monet-water-lilies-thumb.jpg",
        "image": "art/monet-water-lilies.jpg",
        "alt": "克劳德·莫奈《睡莲》，池面上浮着睡莲，水中映着天光",
        "source": "美国大都会艺术博物馆 Open Access（公共领域）",
        "article": "莫奈在睡莲池畔反复观察光线与水面的变化。把这张卡留到清晨再看，"
                   "也是在提醒自己：夜晚已经结束，新的光正在到来。",
    },
    # ... 其余 9 条，由本任务起草后交用户定稿
]
```

**产出要求**：10 条，每条 8 个字段齐全；文章 60–120 字，
语气与上面的《睡莲》一致——把画作与「夜晚结束、清晨到来」的意象扣起来，
不说教、不用感叹号。**交用户定稿后再进入下一步。**

- [ ] **Step 2: 准备图片文件**

每幅两个文件放入 `backend/static/art/`：
- 高清图 `<id>.jpg`，长边 ≤ 1600px，质量 82，目标 ≤ 400KB
- 缩略图 `<id>-thumb.jpg`，长边 ≤ 400px，目标 ≤ 60KB

参考现有 `prototype/image/zhusheng-sleep-ui/monet-water-lilies-optimized.jpg`（375KB）
与 `monet-thumb-optimized.jpg`（56KB）的规格。

图片须来自明确的公共领域来源，与 `source` 字段一致。

- [ ] **Step 3: 写幂等 seed 脚本与测试**

`backend/scripts/seed_art.py`:

```python
import asyncio

from sqlalchemy.dialects.postgresql import insert

from app.core.db import SessionFactory
from app.models import ArtWork
from scripts.art_seed_data import ART_SEED


async def seed() -> int:
    async with SessionFactory() as session:
        for row in ART_SEED:
            # 幂等：已存在则更新元数据，不重复插入，不动 is_active / is_withdrawn
            stmt = insert(ArtWork).values(**row)
            await session.execute(stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={k: stmt.excluded[k] for k in row if k != "id"},
            ))
        await session.commit()
    return len(ART_SEED)


if __name__ == "__main__":
    print(f"已灌入 {asyncio.run(seed())} 幅作品")
```

`backend/tests/test_seed.py`:

```python
from pathlib import Path

from scripts.art_seed_data import ART_SEED

REQUIRED = ("id", "title", "artist", "year", "thumbnail",
            "image", "alt", "source", "article")


def test_seed_has_ten_works():
    assert len(ART_SEED) == 10


def test_every_field_present_and_nonblank():
    for row in ART_SEED:
        for key in REQUIRED:
            assert key in row, f"{row.get('id')} 缺字段 {key}"
            assert row[key].strip(), f"{row.get('id')} 的 {key} 为空"


def test_ids_unique():
    ids = [r["id"] for r in ART_SEED]
    assert len(ids) == len(set(ids))


def test_no_placeholder_source():
    """原型的 source 自带 TODO，上线前必须落实为确切出处。"""
    for row in ART_SEED:
        assert "待" not in row["source"], f"{row['id']} 的来源仍是占位符"
        assert "TODO" not in row["source"].upper()


def test_image_files_exist():
    static = Path(__file__).resolve().parents[1] / "static"
    for row in ART_SEED:
        assert (static / row["image"]).exists(), f"缺图片 {row['image']}"
        assert (static / row["thumbnail"]).exists(), f"缺缩略图 {row['thumbnail']}"


def test_article_length_reasonable():
    for row in ART_SEED:
        assert 40 <= len(row["article"]) <= 200, f"{row['id']} 文章长度异常"
```

- [ ] **Step 4: 运行测试，确认 RED 再 GREEN**

Run: `cd backend && .venv/bin/python -m pytest tests/test_seed.py -v`
先 FAIL（数据未就绪），补齐 10 条与图片后 PASS（6 passed）。

- [ ] **Step 5: 执行灌库并抽验**

Run:
```bash
cd backend && .venv/bin/python -m scripts.seed_art
.venv/bin/python -m scripts.seed_art        # 第二次，验证幂等
```
Expected: 两次均输出 `已灌入 10 幅作品`，库中仍为 10 行。

- [ ] **Step 6: 交付检查**

建议 commit message：`feat(seed): 灌入 10 幅公共领域作品与次日文章`

---

### Task 13: 端到端验收

**Files:**
- Create: `backend/tests/test_e2e_flow.py`

**Interfaces:**
- Consumes: 前述全部接口

- [ ] **Step 1: 写完整流程测试**

`backend/tests/test_e2e_flow.py`:

```python
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

SH = timezone(timedelta(hours=8))


@pytest.fixture
async def client(session):
    from app.core.db import get_session
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    token = (await c.post("/api/v1/auth/wx-login", json={"code": "e2e"})).json()["access_token"]
    c.headers["Authorization"] = f"Bearer {token}"
    return c


async def test_full_ritual_to_reward_flow(client, session, monkeypatch):
    """登录 → 设置 → 完成仪式 → 次日揭晓 → 收藏 → 注销。"""
    from app.models import ArtWork
    session.add(ArtWork(id="w", title="作品", artist="佚名", year="2026",
                        thumbnail="art/w-t.jpg", image="art/w.jpg", alt="w",
                        source="公共领域", article="文章"))
    await session.flush()

    # 1. 设置作息
    assert (await client.put("/api/v1/me/settings", json={
        "bedtime": "23:30", "wake_time": "07:30",
        "timezone": "Asia/Shanghai", "reduced_motion": False})).status_code == 200

    # 2. 按时完成
    r = await client.post("/api/v1/nights/complete", json={
        "completed_at": "2026-08-27T23:50:00+08:00",
        "gratitudes": ["感谢今天"], "plans": ["明天早起"],
    })
    assert r.json() == {"ritual_date": "2026-08-27", "is_eligible": True,
                        "late_minutes": 20, "streak": 1}

    # 3. 当晚不可揭晓
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 27, 23, 55, tzinfo=SH))
    assert (await client.get("/api/v1/rewards/pending")).json()["revealable"] is False

    # 4. 次日 6 点后可揭晓
    monkeypatch.setattr("app.api.v1.rewards._now",
                        lambda: datetime(2026, 8, 28, 7, 0, tzinfo=SH))
    rewards = (await client.post("/api/v1/rewards/reveal")).json()["rewards"]
    assert len(rewards) == 1

    # 5. 收藏可见
    col = (await client.get("/api/v1/collection")).json()
    assert col["total_cards"] == 1 and col["unique_works"] == 1

    # 6. 夜记正文可读
    detail = (await client.get("/api/v1/nights/2026-08-27")).json()
    assert detail["gratitudes"] == ["感谢今天"]

    # 7. 注销后数据清空
    assert (await client.delete("/api/v1/me")).status_code == 204
```

- [ ] **Step 2: 运行全部测试**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: 全部 PASS，零 warning

- [ ] **Step 3: 人工验证 OpenAPI 文档**

Run: `cd backend && .venv/bin/uvicorn app.main:app --reload`
打开 `http://localhost:8000/docs`，逐个接口确认参数与响应体符合 spec 第六节。

- [ ] **Step 4: 逐条核对 spec**

重读 spec，把每条要求映射到一个通过的测试或一次人工验证。
**发现未实现的约束要如实报告，不得声称完成。**

重点核对 7 处修正：揭晓窗口 06:00、连续按时衰减、资格窗口、抽卡曲线、
草稿不上云（后端不接收草稿）、时区显式传入、正文窗口内可改。

另核对：`/config` 与 `/events` 已实现；匿名事件拒收正文字段；
Redis 断开时 `test_ritual_api.py` 与 `test_reward_api.py` 仍全绿。

- [ ] **Step 5: 交付检查**

建议 commit message：`test: 端到端流程验收`

---

## 后续

阶段一的小程序端另出一份计划：`docs/superpowers/plans/2026-08-30-zhusheng-miniprogram.md`，
依赖本计划的 `shared/ritual-cases.json` 与 OpenAPI 契约。

**上线前必须完成**（本计划不覆盖）：
- 轮换已泄露的 PostgreSQL 与 Redis 口令
- 落实 10 幅作品的确切版权来源
- 备案域名 + HTTPS，配置为小程序合法域名
- 图片迁至对象存储，改 `ASSET_BASE_URL`
- 关闭 `WX_MOCK_LOGIN`，接入真实 `code2Session` 与 `msgSecCheck`

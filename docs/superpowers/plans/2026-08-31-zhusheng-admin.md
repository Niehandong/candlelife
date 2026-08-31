# 烛生 PC 后台管理系统 实施计划（阶段二）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个自托管的 PC 后台 —— 管理员用户名密码登录后，可管理艺术作品库与全部 43 项运营配置，且**没有任何接口能看到用户个人数据**。

**Architecture:** 复用阶段一的同一个 FastAPI 服务，管理路由挂在 `/api/v1/admin/*`，靠 JWT 的 `kind: "admin"` 与小程序 token 完全隔离。运营配置以单行 JSONB 存 `app_config` 表，公开的 `GET /api/v1/config` 改为「查库优先、坏数据回落常量」。前端是独立的 `admin/` 目录（React 18 + Vite + TS），类型自定义、不与小程序共享，靠一条比对 OpenAPI 的契约测试防漂移，构建产物为纯静态文件交 Nginx。

**Tech Stack:** FastAPI / SQLAlchemy 2.0 async / Alembic / Pydantic v2 / passlib[bcrypt] / PyJWT / Redis（可选）｜ React 18 + Vite 8 + TypeScript 5.9 + react-router-dom 7 + vitest

**Spec:** `docs/superpowers/specs/2026-08-31-zhusheng-admin-design.md`

---

## Global Constraints

这些约束适用于**每一个任务**，不再逐任务重复。

1. **不执行任何 git 命令。** 本仓库不是 git 仓库。每个任务的最后一步是「记录改动」——把改了哪些文件、建议的 commit message 写进任务小结，由用户本人手动提交。**绝不运行 `git init` / `git add` / `git commit`。**
2. **后端现有 189 项测试必须保持全绿。** 每个后端任务结束前跑一次 `.venv/bin/python -m pytest`，总数只增不减，失败数必须为 0。
3. **隐私硬约束**：`app/api/v1/admin/` 与 `app/services/admin*.py` 下的任何文件，**不得**出现 `decrypt_text` / `decrypt_list` / `NightRecord` / `AnalyticsEvent` 这四个标识符。Task 7 会用 AST 扫描把这条钉死。
4. **数据库 schema 隔离**：所有对象在 `zhusheng`（应用）/ `zhusheng_test`（测试）schema 内。模型**不写** `__table_args__ = {"schema": ...}`。测试需要 `TEST_DATABASE_URL` 环境变量。
5. **Alembic 迁移一律手写，禁止 `--autogenerate`。** 阶段一 autogenerate 曾生成 19 条针对**另一个项目** public schema 的 `DROP TABLE`。新建迁移用 `.venv/bin/alembic revision -m "描述"`（不带 `--autogenerate`），手工填 `upgrade()` / `downgrade()`。
6. **`prototype/` 只读。** 视觉与字段语义的来源，不修改其中任何文件。
7. **Redis 是优化不是正确性依赖。** 任何取用 Redis 的地方都要能接受 `None` 与抛异常，降级路径必须有测试。
8. 后端命令全部在 `backend/` 下、用 `.venv/bin/` 前缀执行；前端命令在 `admin/` 下执行。
9. 新增文案一律简体中文，与 `CONTEXT.md` 的术语表一致（「仪式夜」「资格窗口」「揭晓窗口」「连续按时」），不引入同义词。

---

## 配置数据的规范形状（全任务共用）

后台 5 个模块里有 4 个是配置表单，原型共 **43 个字段**。存储**按领域含义分组，不按原型页面分组** —— 原型把「按时完成容差」放在 records 页、把「感恩数量」放在 ritual 页，但两者在领域里都属于 `ritual`。按含义存的好处：公开 `GET /config` 的映射是恒等的，且日后重排后台页面不需要迁移数据。

`app_config.data` 的 JSONB 全量形状（这就是 `DEFAULT_CONFIG` 序列化后的样子）：

```json
{
  "app": {
    "name": "烛生",
    "slogan": "陪你按时睡觉",
    "home_question": "今晚，几点睡？",
    "skip_tonight_enabled": true,
    "onboarding_enabled": true,
    "reduce_motion_default": true,
    "anonymous_analytics_enabled": false
  },
  "schedule": {
    "bedtime": "23:30",
    "wake_time": "07:30",
    "min_time": "20:00",
    "max_time": "02:00"
  },
  "onboarding": {
    "welcome_title": "让今晚，轻一点。",
    "guest_copy": "无需登录，记录仅保存在这台设备。",
    "guide_rest": "把今天放在门外",
    "guide_light": "为自己留一盏小灯",
    "guide_gift": "明早，收下一份安静的礼物",
    "story_video_path": "story/zhusheng-prologue.mp4",
    "story_poster": "story/01-enter-bedroom.png",
    "story_status": "让这段故事，带你慢慢安静下来。",
    "skip_story_enabled": true
  },
  "ritual": {
    "tolerance_minutes": 30,
    "gratitude_count": 3,
    "plan_count": 3,
    "resistance_options": ["我还在刷手机", "我还在工作", "我还不困", "我舍不得结束今天"],
    "ritual_minutes": 30,
    "dim_minutes": 10,
    "goodnight_text": "今天已经好好结束了。晚安。",
    "interrupt_text": "不用责怪自己。把手机放远一点，今晚仍然可以重新开始。",
    "resistance_reply": "那就先不要求睡着，只把手机放远一点。",
    "stage_not_started_enabled": true,
    "stage_wind_down_enabled": true,
    "stage_quieting_enabled": true,
    "stage_done_enabled": true
  },
  "records": {
    "journal_days": 30,
    "journal_empty_copy": "完成一次睡前仪式后，这里会出现你的熄灯时间和夜晚记录。",
    "comparison_copy": "你比昨天早睡了 {minutes} 分钟。",
    "collection_limit": 100,
    "reward_timing": "next-day",
    "reward_copy": "昨夜按时熄灯，收到一份安静的礼物。",
    "collection_empty_copy": "按计划完成一次熄灯仪式，明天会收到一幅安静的莫奈作品。",
    "random_art_enabled": true,
    "image_fallback_enabled": true
  }
}
```

字段数：app 7 + schedule 4 + onboarding 9 + ritual 13 + records 9 = **42**。

**原型第 43 个字段 `privateWriting` 被刻意剔除。** 原型把「书写内容仅保存在本机／后台不读取感恩和明日计划正文」画成一个可关的开关。这在阶段一已经是架构级保证（正文用 `MultiFernet` 加密存 `BYTEA`，且 Task 7 的 AST 测试禁止 admin 代码引用 `decrypt_*`），**运营不可能把它关掉**。做成开关会谎称一个不存在的能力。前端在仪式模块渲染一行**只读**说明（Task 11），不进 `app_config`。

**原型字段名 → 规范键名对照**（前端表单要用）：

| 原型 `name` | 页面 | 规范路径 |
|---|---|---|
| `appName` / `slogan` / `homeQuestion` | config | `app.name` / `app.slogan` / `app.home_question` |
| `skipTonight` / `onboarding` / `reduceMotion` / `anonymousAnalytics` | config | `app.skip_tonight_enabled` / `app.onboarding_enabled` / `app.reduce_motion_default` / `app.anonymous_analytics_enabled` |
| `bedtime` / `wakeTime` / `minTime` / `maxTime` | config | `schedule.*`（同名 snake_case） |
| `welcomeTitle` / `guestCopy` / `guideRest` / `guideLight` / `guideGift` | onboarding | `onboarding.welcome_title` / `guest_copy` / `guide_rest` / `guide_light` / `guide_gift` |
| `storyVideoPath` / `storyPoster` / `storyStatus` / `skipStory` | onboarding | `onboarding.story_video_path` / `story_poster` / `story_status` / `skip_story_enabled` |
| `ritualMinutes` / `dimMinutes` / `goodnightText` / `interruptText` | ritual | `ritual.ritual_minutes` / `dim_minutes` / `goodnight_text` / `interrupt_text` |
| `resistanceOptions` / `gratitudeCount` / `planCount` / `resistanceReply` | ritual | `ritual.resistance_options` / `gratitude_count` / `plan_count` / `resistance_reply` |
| `state1` / `state2` / `state3` / `state4` | ritual | `ritual.stage_not_started_enabled` / `stage_wind_down_enabled` / `stage_quieting_enabled` / `stage_done_enabled` |
| `privateWriting` | ritual | **不存储**，只读说明行 |
| `journalDays` / `journalEmptyCopy` / `comparisonCopy` | records | `records.journal_days` / `journal_empty_copy` / `comparison_copy` |
| `completionWindow` | records | **`ritual.tolerance_minutes`** ← 跨组，注意 |
| `collectionLimit` / `rewardTiming` / `rewardCopy` / `collectionEmptyCopy` | records | `records.collection_limit` / `reward_timing` / `reward_copy` / `collection_empty_copy` |
| `randomArt` / `imageFallback` | records | `records.random_art_enabled` / `image_fallback_enabled` |

---

## 文件结构

### 后端新增/修改

| 文件 | 职责 |
|---|---|
| `app/domain/config.py` **改** | 从 2 组扩到 5 组；加纯函数 `config_to_dict` / `config_from_dict` / `diff_config`。仍然禁止导入 SQLAlchemy、禁止读环境变量、禁止 `datetime.now()` |
| `app/models/admin.py` **新** | `AdminUser` + `AppConfig` 两个模型 |
| `app/models/__init__.py` **改** | 导出上面两个 |
| `alembic/versions/xxxx_admin_tables.py` **新** | 手写迁移，只建这两张表 |
| `app/core/password.py` **新** | `hash_password` / `verify_password`，passlib[bcrypt] |
| `app/core/security.py` **改** | 加 `create_admin_token` 与 `current_admin_id` 依赖 |
| `app/core/config.py` **改** | 加 `admin_token_ttl_seconds`、`admin_cors_origins`、`admin_login_rate_limit` |
| `app/core/errors.py` **改** | 加 `ERROR_MESSAGES` 表，`_envelope(code, ERROR_MESSAGES.get(code, code))` |
| `app/repositories/admin.py` **新** | `AdminUser` 的读写；`app_config` 单行的读写 |
| `app/repositories/art.py` **改** | 加 `list_all`（含下架与撤回）与 `count_rewards_for` |
| `app/services/admin_auth.py` **新** | 登录编排：查账号 → 验密 → 限流 → 发 token → 记 `last_login_at` |
| `app/services/admin_config.py` **新** | 配置读写编排：校验 → diff → 写库 → 失效 Redis 缓存 |
| `app/services/admin_art.py` **新** | 作品增删改，删除时把外键 RESTRICT 翻成 409 |
| `app/schemas/admin.py` **新** | 全部 admin 请求/响应模型，含 `AdminConfigPayload` 的业务校验 |
| `app/api/v1/admin/__init__.py` **新** | admin 子路由聚合 |
| `app/api/v1/admin/auth.py` **新** | `POST /login`、`GET /me` |
| `app/api/v1/admin/config.py` **新** | `GET`、`PUT[?dry_run]`、`GET /export` |
| `app/api/v1/admin/art.py` **新** | 作品 CRUD |
| `app/api/v1/config.py` **改** | 公开接口改为查库优先、回落常量 |
| `app/api/v1/__init__.py` **改** | 挂载 admin 子路由 |
| `app/main.py` **改** | 按 `admin_cors_origins` 条件挂 CORSMiddleware |
| `scripts/create_admin.py` **新** | CLI 建管理员，密码从 stdin 读 |

### 前端 `admin/`

| 文件 | 职责 |
|---|---|
| `package.json` / `vite.config.ts` / `tsconfig.json` / `index.html` | 脚手架 |
| `src/main.tsx` / `src/App.tsx` | 入口与路由表 |
| `src/styles/tokens.css` | 取自原型 `:root` 的设计令牌 |
| `src/api/types.ts` | ★ 独立类型定义，不与小程序共享 |
| `src/api/client.ts` | fetch 封装、Bearer 注入、401 跳登录 |
| `src/api/endpoints.ts` | 每个接口一个函数 |
| `src/api/__tests__/contract.test.ts` | ★ 与后端 `/openapi.json` 逐字段比对 |
| `src/auth/LoginPage.tsx` / `useAuth.ts` / `RequireAuth.tsx` | 登录与路由守卫 |
| `src/layout/Shell.tsx` / `Sidebar.tsx` | 外壳与 5 项导航 |
| `src/components/Field.tsx` / `DiffTable.tsx` / `StatusTag.tsx` / `ConfirmDialog.tsx` / `Toast.tsx` | 通用组件 |
| `src/modules/config/ConfigPage.tsx` 等 4 个 | 四个配置模块 |
| `src/modules/art/ArtPage.tsx` / `ArtForm.tsx` | 作品库 |

---

## Task 1: 运营配置的领域模型与纯函数

把 `domain/config.py` 从 2 组扩到 5 组，并加三个纯函数：序列化、反序列化（带缺字段回落）、diff。全部是纯逻辑，先在这里做完，后面的服务层只负责搬运。

**Files:**
- Modify: `backend/app/domain/config.py`（现 36 行，整体重写）
- Test: `backend/tests/test_domain_config.py`（新建）

**Interfaces:**
- Consumes: 无（domain 层不依赖任何其他层）
- Produces:
  - `DEFAULT_CONFIG: RuntimeConfig` —— 全字段默认值，形状见本计划「配置数据的规范形状」
  - `config_to_dict(cfg: RuntimeConfig) -> dict` —— 时间序列化为 `"HH:MM"`，元组序列化为 list
  - `config_from_dict(data: dict) -> RuntimeConfig` —— 缺失键回落默认、未知键忽略、类型不对**抛 `ValueError`**
  - `diff_config(old: dict, new: dict) -> list[ConfigChange]`，`ConfigChange` 是 `dataclass(frozen=True)`，字段 `path: str` / `old: object` / `new: object`
  - 既有的 `ScheduleConfig` / `RitualConfigValues` / `RuntimeConfig` 名字不变（`app/api/v1/config.py` 在用），只加字段与新组

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_domain_config.py`：

```python
"""运营配置的纯函数。domain 层不碰 IO，这些测试不需要数据库。"""
import pytest

from app.domain.config import (
    DEFAULT_CONFIG, ConfigChange, config_from_dict, config_to_dict, diff_config,
)


def test_default_config_round_trips():
    """序列化再反序列化必须回到同一个对象——否则保存一次配置就会悄悄改值。"""
    d = config_to_dict(DEFAULT_CONFIG)
    assert config_from_dict(d) == DEFAULT_CONFIG


def test_to_dict_shape_is_five_groups():
    d = config_to_dict(DEFAULT_CONFIG)
    assert set(d) == {"app", "schedule", "onboarding", "ritual", "records"}
    assert len(d["app"]) == 7
    assert len(d["schedule"]) == 4
    assert len(d["onboarding"]) == 9
    assert len(d["ritual"]) == 13
    assert len(d["records"]) == 9


def test_times_serialize_as_hhmm():
    d = config_to_dict(DEFAULT_CONFIG)
    assert d["schedule"] == {"bedtime": "23:30", "wake_time": "07:30",
                             "min_time": "20:00", "max_time": "02:00"}


def test_resistance_options_serialize_as_list():
    d = config_to_dict(DEFAULT_CONFIG)
    assert d["ritual"]["resistance_options"] == [
        "我还在刷手机", "我还在工作", "我还不困", "我舍不得结束今天"]
    assert isinstance(d["ritual"]["resistance_options"], list)


def test_private_writing_is_not_a_config_field():
    """正文加密是架构保证，不是运营开关——不得出现在配置里。"""
    d = config_to_dict(DEFAULT_CONFIG)
    flat = str(d)
    assert "private_writing" not in flat


def test_from_dict_fills_missing_keys_with_defaults():
    """后台没配过、或配置是旧版本少字段时，必须能起来。"""
    cfg = config_from_dict({"app": {"slogan": "陪你好好睡"}})
    assert cfg.app.slogan == "陪你好好睡"
    assert cfg.app.name == "烛生"                       # 缺的回落
    assert cfg.ritual.tolerance_minutes == 30           # 整组缺失也回落
    assert cfg.schedule.bedtime == DEFAULT_CONFIG.schedule.bedtime


def test_from_dict_ignores_unknown_keys():
    """阶段三删掉某个字段后，库里的旧 JSON 不应让服务起不来。"""
    cfg = config_from_dict({"app": {"name": "烛生", "obsolete_field": 1},
                            "no_such_group": {"x": 1}})
    assert cfg.app.name == "烛生"


def test_from_dict_rejects_wrong_type():
    with pytest.raises(ValueError):
        config_from_dict({"ritual": {"tolerance_minutes": "三十分钟"}})


def test_from_dict_rejects_bad_time_format():
    with pytest.raises(ValueError):
        config_from_dict({"schedule": {"bedtime": "晚上十一点半"}})


def test_diff_reports_only_changes():
    old = config_to_dict(DEFAULT_CONFIG)
    new = config_to_dict(DEFAULT_CONFIG)
    new["ritual"]["tolerance_minutes"] = 15
    new["app"]["slogan"] = "陪你好好睡"

    changes = diff_config(old, new)
    assert changes == [
        ConfigChange(path="app.slogan", old="陪你按时睡觉", new="陪你好好睡"),
        ConfigChange(path="ritual.tolerance_minutes", old=30, new=15),
    ]


def test_diff_of_identical_is_empty():
    d = config_to_dict(DEFAULT_CONFIG)
    assert diff_config(d, dict(d)) == []


def test_diff_reports_list_changes_as_whole():
    """阻力选项是一个整体，不逐项 diff——逐项 diff 的展示反而看不懂。"""
    old = config_to_dict(DEFAULT_CONFIG)
    new = config_to_dict(DEFAULT_CONFIG)
    new["ritual"]["resistance_options"] = ["我还在刷手机"]
    changes = diff_config(old, new)
    assert len(changes) == 1
    assert changes[0].path == "ritual.resistance_options"
    assert changes[0].new == ["我还在刷手机"]
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_domain_config.py -v
```

Expected: FAIL —— `ImportError: cannot import name 'ConfigChange' from 'app.domain.config'`

- [ ] **Step 3: 重写 `app/domain/config.py`**

```python
"""运营配置。

【domain 层硬约束】本模块不导入 SQLAlchemy / Redis / httpx，不读环境变量，
不调用 datetime.now()，不读系统本地时区。tests/test_domain_purity.py 把守。

配置的存储形状是这里 config_to_dict() 的输出，直接进 app_config.data 的 JSONB。
"""

from dataclasses import asdict, dataclass, field, fields, is_dataclass
from datetime import time

__all__ = [
    "AppConfigValues", "ScheduleConfig", "OnboardingConfig", "RitualConfigValues",
    "RecordsConfig", "RuntimeConfig", "DEFAULT_CONFIG",
    "ConfigChange", "config_to_dict", "config_from_dict", "diff_config",
]


@dataclass(frozen=True)
class AppConfigValues:
    name: str = "烛生"
    slogan: str = "陪你按时睡觉"
    home_question: str = "今晚，几点睡？"
    skip_tonight_enabled: bool = True
    onboarding_enabled: bool = True
    reduce_motion_default: bool = True
    anonymous_analytics_enabled: bool = False


@dataclass(frozen=True)
class ScheduleConfig:
    bedtime: time = time(23, 30)
    wake_time: time = time(7, 30)
    min_time: time = time(20, 0)      # 资格窗口下界
    max_time: time = time(2, 0)       # 资格窗口上界（跨午夜）


@dataclass(frozen=True)
class OnboardingConfig:
    welcome_title: str = "让今晚，轻一点。"
    guest_copy: str = "无需登录，记录仅保存在这台设备。"
    guide_rest: str = "把今天放在门外"
    guide_light: str = "为自己留一盏小灯"
    guide_gift: str = "明早，收下一份安静的礼物"
    story_video_path: str = "story/zhusheng-prologue.mp4"
    story_poster: str = "story/01-enter-bedroom.png"
    story_status: str = "让这段故事，带你慢慢安静下来。"
    skip_story_enabled: bool = True


@dataclass(frozen=True)
class RitualConfigValues:
    tolerance_minutes: int = 30
    gratitude_count: int = 3
    plan_count: int = 3
    resistance_options: tuple[str, ...] = (
        "我还在刷手机", "我还在工作", "我还不困", "我舍不得结束今天",
    )
    ritual_minutes: int = 30
    dim_minutes: int = 10
    goodnight_text: str = "今天已经好好结束了。晚安。"
    interrupt_text: str = "不用责怪自己。把手机放远一点，今晚仍然可以重新开始。"
    resistance_reply: str = "那就先不要求睡着，只把手机放远一点。"
    # 仪式的四个阶段。关掉某一段即在小程序端跳过它。
    stage_not_started_enabled: bool = True
    stage_wind_down_enabled: bool = True
    stage_quieting_enabled: bool = True
    stage_done_enabled: bool = True


@dataclass(frozen=True)
class RecordsConfig:
    journal_days: int = 30
    journal_empty_copy: str = "完成一次睡前仪式后，这里会出现你的熄灯时间和夜晚记录。"
    comparison_copy: str = "你比昨天早睡了 {minutes} 分钟。"
    collection_limit: int = 100
    reward_timing: str = "next-day"          # next-day | immediate
    reward_copy: str = "昨夜按时熄灯，收到一份安静的礼物。"
    collection_empty_copy: str = "按计划完成一次熄灯仪式，明天会收到一幅安静的莫奈作品。"
    random_art_enabled: bool = True
    image_fallback_enabled: bool = True


@dataclass(frozen=True)
class RuntimeConfig:
    app: AppConfigValues = field(default_factory=AppConfigValues)
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)
    onboarding: OnboardingConfig = field(default_factory=OnboardingConfig)
    ritual: RitualConfigValues = field(default_factory=RitualConfigValues)
    records: RecordsConfig = field(default_factory=RecordsConfig)


DEFAULT_CONFIG = RuntimeConfig()


@dataclass(frozen=True)
class ConfigChange:
    path: str            # 形如 "ritual.tolerance_minutes"
    old: object
    new: object


def _encode(value):
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, tuple):
        return list(value)
    return value


def config_to_dict(cfg: RuntimeConfig) -> dict:
    """序列化为可直接进 JSONB 的 dict。时间转 "HH:MM"，元组转 list。"""
    out: dict = {}
    for group in fields(cfg):
        section = getattr(cfg, group.name)
        out[group.name] = {f.name: _encode(getattr(section, f.name))
                           for f in fields(section)}
    return out


def _parse_time(raw: object, key: str) -> time:
    if isinstance(raw, time):
        return raw
    if not isinstance(raw, str):
        raise ValueError(f"{key} 必须是 HH:MM 字符串，收到 {type(raw).__name__}")
    parts = raw.split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValueError(f"{key} 必须是 HH:MM 格式，收到 {raw!r}")
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"{key} 不是合法时刻：{raw!r}")
    return time(hour, minute)


def _coerce(default, raw, key: str):
    """按默认值的类型把 raw 转过去。转不了就抛 ValueError，让调用方回落。"""
    if isinstance(default, time):
        return _parse_time(raw, key)
    if isinstance(default, tuple):
        if not isinstance(raw, (list, tuple)):
            raise ValueError(f"{key} 必须是数组")
        return tuple(str(x) for x in raw)
    if isinstance(default, bool):                  # bool 必须在 int 之前判
        if not isinstance(raw, bool):
            raise ValueError(f"{key} 必须是布尔值")
        return raw
    if isinstance(default, int):
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise ValueError(f"{key} 必须是整数")
        return raw
    if isinstance(default, str):
        if not isinstance(raw, str):
            raise ValueError(f"{key} 必须是字符串")
        return raw
    raise ValueError(f"{key} 类型不受支持")


def config_from_dict(data: dict) -> RuntimeConfig:
    """从 JSONB 还原。缺失键回落默认、未知键忽略、类型不对抛 ValueError。

    「缺失回落」不是宽容，是必需：阶段三加字段时，库里的旧 JSON 必须仍能启动。
    「类型不对抛错」也是必需：静默回落会让管理员以为保存成功了。
    """
    if not isinstance(data, dict):
        raise ValueError("配置必须是对象")
    kwargs = {}
    for group in fields(RuntimeConfig):
        section_default = getattr(DEFAULT_CONFIG, group.name)
        raw_section = data.get(group.name) or {}
        if not isinstance(raw_section, dict):
            raise ValueError(f"{group.name} 必须是对象")
        values = {}
        for f in fields(section_default):
            default = getattr(section_default, f.name)
            if f.name in raw_section:
                values[f.name] = _coerce(default, raw_section[f.name],
                                         f"{group.name}.{f.name}")
            else:
                values[f.name] = default
        kwargs[group.name] = type(section_default)(**values)
    return RuntimeConfig(**kwargs)


def diff_config(old: dict, new: dict) -> list[ConfigChange]:
    """逐字段比较两份序列化后的配置，按 path 字典序返回变动项。

    列表字段（resistance_options）整体比较，不逐项 diff——逐项展示反而看不懂。
    """
    changes: list[ConfigChange] = []
    for group in sorted(set(old) | set(new)):
        old_section = old.get(group) or {}
        new_section = new.get(group) or {}
        if not isinstance(old_section, dict) or not isinstance(new_section, dict):
            continue
        for key in sorted(set(old_section) | set(new_section)):
            before, after = old_section.get(key), new_section.get(key)
            if before != after:
                changes.append(ConfigChange(f"{group}.{key}", before, after))
    return changes
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_domain_config.py -v
```

Expected: 12 passed

- [ ] **Step 5: 确认没有破坏既有测试**

`app/api/v1/config.py` 引用了 `DEFAULT_CONFIG.schedule.*` 与 `DEFAULT_CONFIG.ritual.*`，这两组的字段名全部保留，应当无影响。跑全量确认：

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 189 + 12 = 201 passed, 0 failed。特别确认 `tests/test_domain_purity.py` 与 `tests/test_config_api.py` 仍绿。

- [ ] **Step 6: 记录改动**

**不执行 git 命令。** 在任务小结里写明：
- 修改 `backend/app/domain/config.py`，新增 `backend/tests/test_domain_config.py`
- 建议 commit message：`feat(config): 运营配置扩至五组并加 diff 纯函数`

---

## Task 2: `admin_users` 与 `app_config` 两张表

两张新表加一次手写迁移。**不用 `--autogenerate`** —— 阶段一它曾生成 19 条针对另一个项目 public schema 的 `DROP TABLE`。

**Files:**
- Create: `backend/app/models/admin.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<rev>_admin_tables.py`
- Test: `backend/tests/test_admin_models.py`

**Interfaces:**
- Consumes: `app.models.base.Base` / `TimestampMixin`（既有）
- Produces:
  - `AdminUser`：`id: uuid.UUID` / `username: str` / `hashed_password: str` / `is_active: bool` / `last_login_at: datetime | None` + `created_at` / `updated_at`
  - `AppConfig`：`id: int`（恒为 1）/ `data: dict` / `updated_by: str` / `updated_at: datetime`

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_admin_models.py`：

```python
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import AdminUser, AppConfig

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_admin_user_defaults(session):
    a = AdminUser(username="alice", hashed_password="x")
    session.add(a)
    await session.flush()
    assert isinstance(a.id, uuid.UUID)
    assert a.is_active is True
    assert a.last_login_at is None
    assert a.created_at is not None


async def test_username_is_unique(session):
    session.add(AdminUser(username="bob", hashed_password="x"))
    await session.flush()
    session.add(AdminUser(username="bob", hashed_password="y"))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_app_config_holds_jsonb(session):
    session.add(AppConfig(id=1, data={"app": {"name": "烛生"}}, updated_by="alice"))
    await session.flush()
    row = (await session.execute(select(AppConfig))).scalar_one()
    assert row.data["app"]["name"] == "烛生"
    assert row.updated_by == "alice"


async def test_app_config_rejects_second_row(session):
    """「单行覆盖」这个决策由数据库 CHECK 落地，应用层写错也插不进第二行。"""
    session.add(AppConfig(id=1, data={}, updated_by="alice"))
    await session.flush()
    await session.execute(
        text("INSERT INTO app_config (id, data, updated_by) VALUES (2, '{}', 'bob')"))
    with pytest.raises(DBAPIError):
        await session.flush()


async def test_admin_tables_are_in_project_schema(session):
    """两张新表必须落在项目 schema 里，不得漏进 public。"""
    for table in ("admin_users", "app_config"):
        found = (await session.execute(
            text("SELECT table_schema FROM information_schema.tables "
                 "WHERE table_name = :t"), {"t": table})).scalars().all()
        assert "public" not in found, f"{table} 出现在 public schema —— 那是另一个项目的地盘"
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_models.py -v
```

Expected: FAIL —— `ImportError: cannot import name 'AdminUser' from 'app.models'`

- [ ] **Step 3: 建模型**

新建 `backend/app/models/admin.py`：

```python
"""后台管理的两张表。

【不写 __table_args__ schema】本项目全部对象靠连接级 search_path 落到
zhusheng / zhusheng_test，模型层写死 schema 会让测试隔离失效。
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, SmallInteger, String, Text, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdminUser(Base, TimestampMixin):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)   # bcrypt
    # 停用而非删除：管理员离职后保留其 username，便于日后追溯 app_config.updated_by
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)


class AppConfig(Base):
    """运营配置。单行覆盖，永远只有 id=1 这一行。

    CHECK (id = 1) 是「单行」这个产品决策的数据库级落地。用户明确选择了
    不做版本化，代价是改错不可逆；防线是保存前 diff 预览与手动导出快照。
    """

    __tablename__ = "app_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_app_config_single_row"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, server_default=text("1"))
    # JSONB 而非逐字段建列：配置有 42 个字段且会随产品增减，逐字段意味着
    # 每加一句文案就要一次迁移。列级类型约束由 Pydantic 在写入前补上。
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
        nullable=False)
```

- [ ] **Step 4: 导出模型**

`backend/app/models/__init__.py` 里加入（保持既有导出不变，只追加）：

```python
from app.models.admin import AdminUser, AppConfig
```

并把 `"AdminUser"` 与 `"AppConfig"` 加进该文件的 `__all__`（若存在）。先看一眼现有内容再改：

```bash
cd backend && cat app/models/__init__.py
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_models.py -v
```

Expected: 5 passed。（测试 fixture 会 `drop_all` + `create_all`，不需要迁移就能跑。）

`gen_random_uuid()` 是 PostgreSQL 13+ 内置函数，不需要 `pgcrypto` 扩展；若报 `function gen_random_uuid() does not exist`，说明库版本低于 13，改用 Python 侧 `default=uuid.uuid4`。

- [ ] **Step 6: 手写迁移**

生成空迁移骨架（**注意：不带 `--autogenerate`**）：

```bash
cd backend && .venv/bin/alembic revision -m "admin tables"
```

把生成文件的 `upgrade()` / `downgrade()` 填成：

```python
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    op.create_table(
        "admin_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_table(
        "app_config",
        sa.Column("id", sa.SmallInteger(), primary_key=True, server_default=sa.text("1")),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("updated_by", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_app_config_single_row"),
    )


def downgrade() -> None:
    op.drop_table("app_config")
    op.drop_table("admin_users")
```

**动手前先核对**：打开生成的文件，确认 `upgrade()` 里**只有**上面这两张表的 `create_table`。如果 alembic 自作主张塞进了任何 `drop_table` 或针对其他表的语句，删掉它们再继续。

- [ ] **Step 7: 应用迁移并验证**

```bash
cd backend && .venv/bin/alembic upgrade head
.venv/bin/python -c "
import asyncio, os
from sqlalchemy import text
from app.core.db import make_engine
async def main():
    eng = make_engine(os.environ.get('DB_SCHEMA', 'zhusheng'))
    async with eng.begin() as c:
        for t in ('admin_users', 'app_config'):
            r = await c.execute(text(
                'SELECT table_schema FROM information_schema.tables WHERE table_name = :t'),
                {'t': t})
            print(t, r.scalars().all())
    await eng.dispose()
asyncio.run(main())
"
```

Expected: 两张表都只出现在 `zhusheng`，输出里**不含 `public`**。

- [ ] **Step 8: 全量回归**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 201 + 5 = 206 passed, 0 failed。特别确认 `tests/test_schema_isolation.py`（断言 public 的 13 张表全在）仍绿。

- [ ] **Step 9: 记录改动**

**不执行 git 命令。** 小结写明新增 `app/models/admin.py`、`alembic/versions/<rev>_admin_tables.py`、`tests/test_admin_models.py`，修改 `app/models/__init__.py`。建议 commit message：`feat(admin): 新增 admin_users 与 app_config 两张表`

---

## Task 3: 密码哈希、管理员 token、建号 CLI

**Files:**
- Create: `backend/app/core/password.py`
- Modify: `backend/app/core/security.py`（追加两个函数，既有内容不动）
- Modify: `backend/app/core/config.py`（加三个设置项）
- Modify: `backend/requirements.txt`
- Create: `backend/scripts/create_admin.py`
- Test: `backend/tests/test_admin_password.py`

**Interfaces:**
- Consumes: `AdminUser`（Task 2）、既有的 `decode_token(token, expect_kind)`
- Produces:
  - `app.core.password.hash_password(plain: str) -> str`
  - `app.core.password.verify_password(plain: str, hashed: str) -> bool`（**任何异常都返回 False**）
  - `app.core.password.MAX_PASSWORD_BYTES = 72`
  - `app.core.security.create_admin_token(admin_id: uuid.UUID) -> str`
  - `app.core.security.current_admin_id` —— FastAPI 依赖，返回 `uuid.UUID`
  - Settings 新增 `admin_token_ttl_seconds: int = 8 * 60 * 60`、`admin_cors_origins: str = ""`、`admin_login_max_per_minute: int = 5`

### 依赖选型的一处偏离 spec

spec 第二节写「新增依赖 `passlib[bcrypt]`」。**实测该组合在当前环境下不可用**：passlib 1.7.4（2020 年最后发版，已无维护）与 bcrypt 5.0 不兼容，首次调用 `CryptContext.hash()` 即在 `passlib/handlers/bcrypt.py:380 detect_wrap_bug` 抛 `ValueError: password cannot be longer than 72 bytes`。

**改为直接依赖 `bcrypt>=5.0`，不引入 passlib。** passlib 在这里只提供一层 `CryptContext` 包装，而我们只用一种算法，包装没有收益。代价是要自己处理两个 passlib 本会兜住的边界，下面的实现都覆盖了：

1. bcrypt 的密码上限是 **72 字节**（不是 72 字符 —— 中文一字 3 字节，即 24 个汉字），超出直接抛 `ValueError`
2. 库里存了非 bcrypt 格式的字符串时，`checkpw` 抛 `ValueError: Invalid salt`

- [ ] **Step 1: 装依赖**

```bash
cd backend && .venv/bin/pip install 'bcrypt>=5.0'
.venv/bin/python -c "import bcrypt; print(bcrypt.__version__)"
```

在 `backend/requirements.txt` 追加一行 `bcrypt>=5.0`（**不要**加 passlib）。

- [ ] **Step 2: 写失败测试**

新建 `backend/tests/test_admin_password.py`：

```python
"""密码哈希与管理员 token。不依赖数据库。"""
import uuid

import pytest
from fastapi import HTTPException

from app.core.password import MAX_PASSWORD_BYTES, hash_password, verify_password
from app.core.security import create_access_token, create_admin_token, decode_token


def test_hash_is_not_plaintext_and_is_salted():
    h1 = hash_password("correct horse")
    h2 = hash_password("correct horse")
    assert "correct horse" not in h1
    assert h1 != h2, "同一密码两次哈希必须不同——否则说明没加盐"
    assert h1.startswith("$2b$")


def test_verify_accepts_right_and_rejects_wrong():
    h = hash_password("correct horse")
    assert verify_password("correct horse", h) is True
    assert verify_password("wrong horse", h) is False
    assert verify_password("", h) is False


def test_verify_returns_false_on_corrupt_hash():
    """库里存了坏值时必须判为失败，不能把 ValueError 抛成 500。"""
    assert verify_password("anything", "not-a-bcrypt-hash") is False
    assert verify_password("anything", "") is False


def test_hash_rejects_password_over_72_bytes():
    """bcrypt 的硬上限。中文一字 3 字节，24 个汉字就到顶。"""
    assert MAX_PASSWORD_BYTES == 72
    with pytest.raises(ValueError):
        hash_password("x" * 73)
    with pytest.raises(ValueError):
        hash_password("密" * 25)          # 75 字节


def test_hash_accepts_exactly_72_bytes():
    assert hash_password("x" * 72).startswith("$2b$")


def test_admin_token_has_admin_kind():
    admin_id = uuid.uuid4()
    token = create_admin_token(admin_id)
    payload = decode_token(token, expect_kind="admin")
    assert payload["sub"] == str(admin_id)
    assert payload["kind"] == "admin"


def test_user_token_cannot_pass_as_admin():
    """两套 token 完全隔离：用户 token 打管理接口必须打不通。"""
    token = create_access_token(uuid.uuid4())
    with pytest.raises(HTTPException) as exc:
        decode_token(token, expect_kind="admin")
    assert exc.value.status_code == 401
    assert exc.value.detail == "TOKEN_KIND_MISMATCH"


def test_admin_token_cannot_pass_as_user():
    token = create_admin_token(uuid.uuid4())
    with pytest.raises(HTTPException) as exc:
        decode_token(token, expect_kind="access")
    assert exc.value.detail == "TOKEN_KIND_MISMATCH"


def test_admin_token_carries_no_username():
    """token 泄露不该连带泄露账号名——与阶段一「不放 openid」同理。"""
    token = create_admin_token(uuid.uuid4())
    payload = decode_token(token, expect_kind="admin")
    assert set(payload) == {"sub", "kind", "iat", "exp", "jti"}
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_password.py -v
```

Expected: FAIL —— `ModuleNotFoundError: No module named 'app.core.password'`

- [ ] **Step 4: 实现 `app/core/password.py`**

```python
"""管理员密码哈希。

直接用 bcrypt，不经 passlib：passlib 1.7.4 已无维护，且与 bcrypt 5.x 不兼容
（首次 hash 即在 detect_wrap_bug 抛 ValueError）。我们只用一种算法，
CryptContext 那层包装没有收益。
"""

import bcrypt

# bcrypt 的硬上限，超出会抛 ValueError。注意是字节不是字符：中文一字 3 字节。
MAX_PASSWORD_BYTES = 72


def hash_password(plain: str) -> str:
    raw = plain.encode("utf-8")
    if len(raw) > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"密码不得超过 {MAX_PASSWORD_BYTES} 字节（当前 {len(raw)}）。"
            "这是 bcrypt 的硬上限，中文一字算 3 字节。"
        )
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """校验失败一律返回 False。

    库里存了坏值、或密码超长时 bcrypt 会抛 ValueError；那是「验不过」，
    不是「服务器错误」，绝不能冒泡成 500。
    """
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
```

- [ ] **Step 5: 在 `app/core/security.py` 末尾追加**

既有内容一行不改，只追加：

```python
def create_admin_token(admin_id: uuid.UUID) -> str:
    """后台 token：8 小时，无 refresh。

    长效 refresh token 存在浏览器里，对一个能改全局配置的后台是不必要的
    攻击面。管理员一天登录一次不算负担。
    """
    return _encode(admin_id, get_settings().admin_token_ttl_seconds, "admin")


async def current_admin_id(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> uuid.UUID:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "TOKEN_MISSING")
    return uuid.UUID(decode_token(cred.credentials, expect_kind="admin")["sub"])
```

`_encode` 里那句注释 `# access | refresh，不可混用` 改成 `# access | refresh | admin，不可混用`。

- [ ] **Step 6: 在 `app/core/config.py` 的 `Settings` 里加三项**

放在 `refresh_token_ttl_seconds` 之后：

```python
    admin_token_ttl_seconds: int = 8 * 60 * 60      # 后台 8 小时，无 refresh
    admin_login_max_per_minute: int = 5             # 同一 IP 每分钟登录尝试上限
    # 空 = 不开 CORS（默认假定 admin 与 API 同源，由 Nginx 反代 /api）。
    # 分域名部署时填逗号分隔的源，如 "https://admin.example.com"。
    admin_cors_origins: str = ""
```

并在 `fernet_key_list` 属性旁加一个：

```python
    @property
    def admin_cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.admin_cors_origins.split(",") if o.strip()]
```

- [ ] **Step 7: 跑测试确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_password.py -v
```

Expected: 9 passed

- [ ] **Step 8: 写建号 CLI**

新建 `backend/scripts/create_admin.py`：

```python
"""创建/重置管理员账号。

阶段二不提供注册接口，也不提供改密接口——一个能改全局配置的后台，
自助注册就是把门拆了。建号与改密都走这个脚本，需要服务器 shell 权限。

    .venv/bin/python -m scripts.create_admin <username>
    .venv/bin/python -m scripts.create_admin <username> --reset

密码从 stdin 交互读取（getpass），不落命令行历史。
"""

import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.db import SessionFactory
from app.core.password import MAX_PASSWORD_BYTES, hash_password
from app.models import AdminUser

MIN_PASSWORD_LEN = 12


def _read_password() -> str:
    first = getpass.getpass("密码（至少 12 位）：")
    if len(first) < MIN_PASSWORD_LEN:
        sys.exit(f"密码太短，至少 {MIN_PASSWORD_LEN} 位。")
    if len(first.encode("utf-8")) > MAX_PASSWORD_BYTES:
        sys.exit(f"密码超过 {MAX_PASSWORD_BYTES} 字节（bcrypt 上限，中文一字 3 字节）。")
    if first != getpass.getpass("再输一次："):
        sys.exit("两次输入不一致。")
    return first


async def _main(username: str, reset: bool) -> None:
    password = _read_password()
    async with SessionFactory() as session:
        existing = await session.scalar(
            select(AdminUser).where(AdminUser.username == username))
        if existing is not None and not reset:
            sys.exit(f"管理员 {username!r} 已存在。要改密码请加 --reset。")
        if existing is not None:
            existing.hashed_password = hash_password(password)
            existing.is_active = True
            action = "已重置密码"
        else:
            session.add(AdminUser(username=username,
                                  hashed_password=hash_password(password)))
            action = "已创建"
        await session.commit()
    print(f"管理员 {username!r} {action}。")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--reset"]
    if len(args) != 1:
        sys.exit("用法：python -m scripts.create_admin <username> [--reset]")
    asyncio.run(_main(args[0], "--reset" in sys.argv[1:]))
```

- [ ] **Step 9: 手工验证 CLI（连真实 zhusheng schema）**

```bash
cd backend
printf '<开发期密码，见本地记录>\n<开发期密码，见本地记录>\n' | .venv/bin/python -m scripts.create_admin devadmin
```

Expected: `管理员 'devadmin' 已创建。`

再跑一次应报「已存在」，加 `--reset` 应报「已重置密码」：

```bash
cd backend
printf '<开发期密码，见本地记录>\n<开发期密码，见本地记录>\n' | .venv/bin/python -m scripts.create_admin devadmin
printf '<开发期密码，见本地记录>\n<开发期密码，见本地记录>\n' | .venv/bin/python -m scripts.create_admin devadmin --reset
```

> `getpass` 在管道输入下会走 fallback 并打一条警告到 stderr，属正常。真实使用是交互式输入。
> 这个 `devadmin` 账号是**开发用**，上线前必须用 `--reset` 换成强密码，或直接从库里删掉。此事记入 Task 13 的验收清单。

- [ ] **Step 10: 全量回归**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 206 + 9 = 215 passed, 0 failed

- [ ] **Step 11: 记录改动**

**不执行 git 命令。** 小结列出新增 `app/core/password.py`、`scripts/create_admin.py`、`tests/test_admin_password.py`，修改 `app/core/security.py`、`app/core/config.py`、`requirements.txt`。**并明确写出对 spec 的偏离**：用 `bcrypt>=5.0` 取代 `passlib[bcrypt]`，附实测理由。建议 commit message：`feat(admin): 管理员密码哈希与 admin token`

---

## Task 4: 登录接口、`/me`、失败限流

**Files:**
- Create: `backend/app/repositories/admin.py`
- Create: `backend/app/services/admin_auth.py`
- Create: `backend/app/api/v1/admin/__init__.py`
- Create: `backend/app/api/v1/admin/auth.py`
- Create: `backend/app/schemas/admin.py`
- Modify: `backend/app/api/v1/__init__.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_admin_auth.py`

**Interfaces:**
- Consumes: `AdminUser`（Task 2）、`hash_password` / `verify_password` / `create_admin_token` / `current_admin_id`（Task 3）、`app.core.redis.get_redis` / `key`（既有）
- Produces:
  - `app.repositories.admin.get_admin_by_username(session, username) -> AdminUser | None`
  - `app.repositories.admin.get_admin(session, admin_id) -> AdminUser | None`
  - `app.services.admin_auth.login(session, username, password, client_ip) -> str`（返回 token，失败抛 `HTTPException`）
  - `app.services.admin_auth.rate_limit_ok(client_ip) -> bool`（Redis 不可用时返回 True）
  - `app.schemas.admin.AdminLoginRequest` / `AdminTokenResponse` / `AdminMeResponse`
  - 路由前缀 `/api/v1/admin`

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_admin_auth.py`：

```python
"""管理员登录。"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.core.password import hash_password
from app.core.security import create_access_token, create_admin_token
from app.models import AdminUser

pytestmark = pytest.mark.asyncio(loop_scope="session")

PASSWORD = "a-strong-dev-password"


async def _make_admin(session, username="alice", active=True) -> AdminUser:
    admin = AdminUser(username=username, hashed_password=hash_password(PASSWORD),
                      is_active=active)
    session.add(admin)
    await session.flush()
    return admin


async def test_login_returns_admin_token(client, session):
    await _make_admin(session)
    r = await client.post("/api/v1/admin/login",
                          json={"username": "alice", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 8 * 60 * 60


async def test_login_records_last_login_at(client, session):
    admin = await _make_admin(session, "bob")
    assert admin.last_login_at is None
    await client.post("/api/v1/admin/login",
                      json={"username": "bob", "password": PASSWORD})
    await session.refresh(admin)
    assert admin.last_login_at is not None


async def test_wrong_password_and_unknown_user_are_indistinguishable(client, session):
    """不泄露「这个用户名存在」——两种失败的状态码与错误码必须完全一致。"""
    await _make_admin(session, "carol")
    wrong = await client.post("/api/v1/admin/login",
                              json={"username": "carol", "password": "nope"})
    missing = await client.post("/api/v1/admin/login",
                                json={"username": "nobody", "password": "nope"})
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json()["code"] == missing.json()["code"] == "ADMIN_LOGIN_FAILED"
    assert wrong.json() == missing.json()


async def test_inactive_admin_cannot_login(client, session):
    await _make_admin(session, "dave", active=False)
    r = await client.post("/api/v1/admin/login",
                          json={"username": "dave", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["code"] == "ADMIN_INACTIVE"


async def test_me_returns_username(client, session):
    admin = await _make_admin(session, "erin")
    token = create_admin_token(admin.id)
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["username"] == "erin"


async def test_me_rejects_user_token(client, session):
    """小程序的 token 打不进管理接口。"""
    token = create_access_token(uuid.uuid4())
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["code"] == "TOKEN_KIND_MISMATCH"


async def test_me_rejects_missing_token(client):
    r = await client.get("/api/v1/admin/me")
    assert r.status_code == 401
    assert r.json()["code"] == "TOKEN_MISSING"


async def test_me_rejects_deleted_admin(client):
    """token 有效但账号已被删——不能凭一张过期不了的票进来。"""
    token = create_admin_token(uuid.uuid4())
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["code"] == "ADMIN_NOT_FOUND"


async def test_me_rejects_admin_deactivated_after_login(client, session):
    """8 小时的 token 期间账号被停用，剩余时间内必须立刻失效。"""
    admin = await _make_admin(session, "frank")
    token = create_admin_token(admin.id)
    admin.is_active = False
    await session.flush()
    r = await client.get("/api/v1/admin/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    assert r.json()["code"] == "ADMIN_INACTIVE"


async def test_rate_limit_blocks_sixth_attempt(client, session):
    """同一 IP 每分钟 5 次。第 6 次返回 429。"""
    await _make_admin(session, "grace")
    fake = AsyncMock()
    fake.incr.side_effect = [1, 2, 3, 4, 5, 6]
    fake.expire.return_value = True
    with patch("app.services.admin_auth.get_redis", return_value=fake):
        codes = []
        for _ in range(6):
            r = await client.post("/api/v1/admin/login",
                                  json={"username": "grace", "password": "wrong"})
            codes.append(r.status_code)
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


async def test_rate_limit_degrades_open_when_redis_down(client, session):
    """Redis 是优化不是正确性依赖：它挂了，登录必须照常可用。"""
    await _make_admin(session, "heidi")
    fake = AsyncMock()
    fake.incr.side_effect = ConnectionError("redis down")
    with patch("app.services.admin_auth.get_redis", return_value=fake):
        r = await client.post("/api/v1/admin/login",
                              json={"username": "heidi", "password": PASSWORD})
    assert r.status_code == 200


async def test_rate_limit_degrades_open_when_no_client(client, session):
    await _make_admin(session, "ivan")
    with patch("app.services.admin_auth.get_redis", return_value=None):
        r = await client.post("/api/v1/admin/login",
                              json={"username": "ivan", "password": PASSWORD})
    assert r.status_code == 200


async def test_login_rejects_overlong_password_without_500(client, session):
    """超过 bcrypt 72 字节上限的密码必须是 422，不能冒泡成 500。"""
    await _make_admin(session, "judy")
    r = await client.post("/api/v1/admin/login",
                          json={"username": "judy", "password": "x" * 200})
    assert r.status_code == 422


async def test_login_response_never_contains_password_or_hash(client, session):
    await _make_admin(session, "ken")
    r = await client.post("/api/v1/admin/login",
                          json={"username": "ken", "password": PASSWORD})
    body = r.text
    assert PASSWORD not in body
    assert "hashed_password" not in body
    assert "$2b$" not in body
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_auth.py -v
```

Expected: FAIL —— 全部 404（路由不存在）

- [ ] **Step 3: 建 `app/repositories/admin.py`**

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminUser


async def get_admin_by_username(session: AsyncSession, username: str) -> AdminUser | None:
    return await session.scalar(select(AdminUser).where(AdminUser.username == username))


async def get_admin(session: AsyncSession, admin_id: uuid.UUID) -> AdminUser | None:
    return await session.get(AdminUser, admin_id)
```

- [ ] **Step 4: 建 `app/schemas/admin.py`**

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.password import MAX_PASSWORD_BYTES


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64)
    # 上限按字节算才准（中文一字 3 字节），字符上限只是第一道闸；
    # 真正的字节校验在 service 里，超限返回 422 而非 500。
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_BYTES)


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AdminMeResponse(BaseModel):
    username: str
    last_login_at: datetime | None
```

- [ ] **Step 5: 建 `app/services/admin_auth.py`**

```python
"""管理员登录编排。

【隐私硬约束】本文件不得引用 NightRecord / AnalyticsEvent / decrypt_*。
tests/test_admin_privacy.py 用 AST 扫描把守。
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.password import MAX_PASSWORD_BYTES, verify_password
from app.core.redis import get_redis, key
from app.core.security import create_admin_token
from app.models import AdminUser
from app.repositories import admin as admin_repo

logger = logging.getLogger("zhusheng")


async def rate_limit_ok(client_ip: str) -> bool:
    """同一 IP 每分钟至多 N 次登录尝试。

    Redis 不可用时**放行**。这是刻意的：限流是优化，不是正确性依赖。
    Redis 挂掉时锁死登录，等于让运维在最需要进后台的时候进不去。
    """
    client = get_redis()
    if client is None:
        return True
    bucket = key("admin", "login", client_ip)
    try:
        count = await client.incr(bucket)
        if count == 1:
            await client.expire(bucket, 60)
        return count <= get_settings().admin_login_max_per_minute
    except Exception:
        logger.warning("登录限流不可用，降级放行 ip=%s", client_ip)
        return True


async def login(session: AsyncSession, username: str, password: str,
                client_ip: str) -> tuple[str, int]:
    """返回 (token, ttl_seconds)。任何失败都抛 HTTPException。"""
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        # bcrypt 的硬上限。挡在这里，避免 hashpw 抛 ValueError 冒泡成 500。
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "PASSWORD_TOO_LONG")

    if not await rate_limit_ok(client_ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS")

    admin: AdminUser | None = await admin_repo.get_admin_by_username(session, username)

    # 用户名不存在与密码错误返回完全相同的响应，不泄露账号是否存在。
    if admin is None or not verify_password(password, admin.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ADMIN_LOGIN_FAILED")
    if not admin.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ADMIN_INACTIVE")

    admin.last_login_at = datetime.now(timezone.utc)
    await session.flush()

    ttl = get_settings().admin_token_ttl_seconds
    return create_admin_token(admin.id), ttl


async def require_active_admin(session: AsyncSession, admin_id: uuid.UUID) -> AdminUser:
    """token 有效不等于账号还在。每个管理接口都要过这一关。

    8 小时的 token 期间账号可能被删或被停用，此时剩余时间内必须立刻失效——
    没有 refresh 机制可以吊销，只能每次查库。
    """
    admin = await admin_repo.get_admin(session, admin_id)
    if admin is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ADMIN_NOT_FOUND")
    if not admin.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ADMIN_INACTIVE")
    return admin
```

- [ ] **Step 6: 建 `app/api/v1/admin/auth.py`**

```python
import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_admin_id
from app.schemas.admin import AdminLoginRequest, AdminMeResponse, AdminTokenResponse
from app.services import admin_auth

router = APIRouter(tags=["admin"])


async def current_admin(
    admin_id: uuid.UUID = Depends(current_admin_id),
    session: AsyncSession = Depends(get_session),
):
    """所有管理接口共用的依赖：token 合法 + 账号仍在且启用。"""
    return await admin_auth.require_active_admin(session, admin_id)


@router.post("/login", response_model=AdminTokenResponse)
async def login(payload: AdminLoginRequest, request: Request,
                session: AsyncSession = Depends(get_session)):
    client_ip = request.client.host if request.client else "unknown"
    token, ttl = await admin_auth.login(
        session, payload.username, payload.password, client_ip)
    await session.commit()
    return AdminTokenResponse(access_token=token, expires_in=ttl)


@router.get("/me", response_model=AdminMeResponse)
async def me(admin=Depends(current_admin)):
    return AdminMeResponse(username=admin.username, last_login_at=admin.last_login_at)
```

- [ ] **Step 7: 建 `app/api/v1/admin/__init__.py`**

```python
from fastapi import APIRouter

from app.api.v1.admin import auth

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(auth.router)
```

- [ ] **Step 8: 挂载到 `app/api/v1/__init__.py`**

```python
from app.api.v1.admin import admin_router
...
api_router.include_router(admin_router)
```

- [ ] **Step 9: 在 `app/main.py` 里按需开 CORS**

在 `register_exception_handlers(app)` 之后加：

```python
    # 默认假定 admin 与 API 同源（Nginx 把 /api 反代到后端），不开 CORS。
    # 分域名部署时设 ADMIN_CORS_ORIGINS，不需改代码。
    origins = settings.admin_cors_origin_list
    if origins:
        from fastapi.middleware.cors import CORSMiddleware
        app.add_middleware(
            CORSMiddleware, allow_origins=origins, allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"])
```

`allow_credentials=False` 是刻意的：token 走 `Authorization` 头，不用 cookie，因此不需要携带凭证的跨域，也就避开了 `allow_origins=["*"]` + credentials 的经典漏洞。

- [ ] **Step 10: 跑测试确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_auth.py -v
```

Expected: 14 passed

- [ ] **Step 11: 全量回归**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 215 + 14 = 229 passed, 0 failed

- [ ] **Step 12: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin): 管理员登录、/me 与失败限流`

---

## Task 5: 运营配置的读写、校验、dry-run diff、导出

本任务最重的部分是校验。42 个字段的表单，管理员最可能犯的错不是不能回滚，
而是**改了自己没意识到改了什么**——所以 dry-run diff 与逐字段校验都是刚需。

**Files:**
- Modify: `backend/app/repositories/admin.py`（追加两个函数）
- Modify: `backend/app/schemas/admin.py`（追加配置模型）
- Create: `backend/app/services/admin_config.py`
- Create: `backend/app/api/v1/admin/config.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Modify: `backend/app/api/v1/config.py`（公开接口改为查库优先）
- Test: `backend/tests/test_admin_config.py`

**Interfaces:**
- Consumes: `AppConfig`（Task 2）、`config_to_dict` / `config_from_dict` / `diff_config` / `ConfigChange` / `DEFAULT_CONFIG`（Task 1）、`current_admin`（Task 4）
- Produces:
  - `app.repositories.admin.get_app_config(session) -> AppConfig | None`
  - `app.repositories.admin.upsert_app_config(session, data: dict, updated_by: str) -> AppConfig`
  - `app.services.admin_config.load_active_config(session) -> RuntimeConfig` —— 查库优先、坏数据回落 `DEFAULT_CONFIG`
  - `app.services.admin_config.preview(session, payload_dict) -> list[ConfigChange]`
  - `app.services.admin_config.save(session, payload_dict, username) -> AppConfig`
  - `app.services.admin_config.invalidate_cache() -> None`
  - `app.schemas.admin.AdminConfigPayload`（5 个嵌套组）、`AdminConfigResponse`、`ConfigDiffResponse`
  - Redis 缓存键 `zhusheng:config:active`

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_admin_config.py`：

```python
"""运营配置的读写。"""
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.core.password import hash_password
from app.core.security import create_admin_token
from app.domain.config import DEFAULT_CONFIG, config_to_dict
from app.models import AdminUser, AppConfig

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _admin_headers(session, username="cfgadmin") -> dict:
    admin = AdminUser(username=username, hashed_password=hash_password("x" * 16))
    session.add(admin)
    await session.flush()
    return {"Authorization": f"Bearer {create_admin_token(admin.id)}"}


def _full_payload() -> dict:
    """一份完整合法的配置，测试从它出发改一两个字段。"""
    return config_to_dict(DEFAULT_CONFIG)


# ---------- 读 ----------

async def test_get_config_returns_defaults_when_never_saved(client, session):
    """后台没配过时，读到的是常量默认值，不是 404。"""
    h = await _admin_headers(session)
    r = await client.get("/api/v1/admin/config", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["config"]["app"]["name"] == "烛生"
    assert body["updated_by"] is None
    assert body["updated_at"] is None


async def test_get_config_requires_admin_token(client):
    r = await client.get("/api/v1/admin/config")
    assert r.status_code == 401


async def test_get_config_reads_saved_row(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["app"]["slogan"] = "陪你好好睡"
    session.add(AppConfig(id=1, data=data, updated_by="someone"))
    await session.flush()
    r = await client.get("/api/v1/admin/config", headers=h)
    assert r.json()["config"]["app"]["slogan"] == "陪你好好睡"
    assert r.json()["updated_by"] == "someone"


# ---------- 写 ----------

async def test_put_config_saves_and_is_readable(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 15
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 200
    again = await client.get("/api/v1/admin/config", headers=h)
    assert again.json()["config"]["ritual"]["tolerance_minutes"] == 15
    assert again.json()["updated_by"] == "cfgadmin"


async def test_put_config_overwrites_the_single_row(client, session):
    """单行覆盖：连保存两次，库里仍只有一行。"""
    from sqlalchemy import func, select
    h = await _admin_headers(session)
    await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    count = await session.scalar(select(func.count()).select_from(AppConfig))
    assert count == 1


async def test_put_config_requires_admin_token(client):
    r = await client.put("/api/v1/admin/config", json=_full_payload())
    assert r.status_code == 401


# ---------- dry_run ----------

async def test_dry_run_reports_changes_without_writing(client, session):
    from sqlalchemy import func, select
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 15
    data["app"]["slogan"] = "陪你好好睡"

    r = await client.put("/api/v1/admin/config?dry_run=true", json=data, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["errors"] == []
    assert {c["path"] for c in body["changes"]} == {
        "app.slogan", "ritual.tolerance_minutes"}
    change = next(c for c in body["changes"] if c["path"] == "ritual.tolerance_minutes")
    assert change["from"] == 30
    assert change["to"] == 15

    assert await session.scalar(select(func.count()).select_from(AppConfig)) == 0


async def test_dry_run_of_unchanged_payload_is_empty(client, session):
    h = await _admin_headers(session)
    r = await client.put("/api/v1/admin/config?dry_run=true",
                         json=_full_payload(), headers=h)
    assert r.json()["changes"] == []


# ---------- 校验边界 ----------

@pytest.mark.parametrize("group,field,bad", [
    ("ritual", "tolerance_minutes", -1),
    ("ritual", "tolerance_minutes", 181),
    ("ritual", "gratitude_count", 0),
    ("ritual", "gratitude_count", 6),
    ("ritual", "plan_count", 0),
    ("ritual", "plan_count", 6),
    ("ritual", "resistance_options", []),
    ("ritual", "resistance_options", ["x"] * 9),
    ("ritual", "resistance_options", ["  "]),
    ("ritual", "resistance_options", ["超" * 33]),
    ("ritual", "goodnight_text", ""),
    ("ritual", "goodnight_text", "长" * 201),
    ("app", "name", ""),
    ("app", "slogan", "长" * 201),
    ("schedule", "bedtime", "25:00"),
    ("schedule", "bedtime", "晚上十一点"),
    ("records", "journal_days", 0),
    ("records", "collection_limit", 0),
    ("records", "reward_timing", "whenever"),
])
async def test_invalid_field_returns_422(client, session, group, field, bad):
    h = await _admin_headers(session)
    data = _full_payload()
    data[group][field] = bad
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 422, f"{group}.{field}={bad!r} 本应被拒绝"


async def test_min_time_equal_max_time_is_rejected(client, session):
    """资格窗口宽度为零 = 所有用户永远不合格。这是最贵的一个手滑。"""
    h = await _admin_headers(session)
    data = _full_payload()
    data["schedule"]["min_time"] = "22:00"
    data["schedule"]["max_time"] = "22:00"
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 422


async def test_dry_run_reports_errors_instead_of_422(client, session):
    """dry_run 是预览：校验不过也要把逐字段错误列出来给管理员看。"""
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 999
    r = await client.put("/api/v1/admin/config?dry_run=true", json=data, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert any("tolerance_minutes" in e["field"] for e in body["errors"])
    assert body["changes"] == []


async def test_unknown_field_is_rejected(client, session):
    """打错字段名必须报错，不能静默丢弃——静默丢弃会让管理员以为保存成功了。"""
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerence_minutes"] = 15          # 故意拼错
    r = await client.put("/api/v1/admin/config", json=data, headers=h)
    assert r.status_code == 422


# ---------- 导出 ----------

async def test_export_returns_downloadable_json(client, session):
    h = await _admin_headers(session)
    await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    r = await client.get("/api/v1/admin/config/export", headers=h)
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    assert ".json" in r.headers["content-disposition"]
    assert json.loads(r.text)["app"]["name"] == "烛生"


# ---------- 公开接口的联动 ----------

async def test_public_config_reflects_saved_values(client, session):
    h = await _admin_headers(session)
    data = _full_payload()
    data["ritual"]["tolerance_minutes"] = 15
    data["schedule"]["bedtime"] = "22:45"
    await client.put("/api/v1/admin/config", json=data, headers=h)

    r = await client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["ritual"]["tolerance_minutes"] == 15
    assert r.json()["schedule"]["bedtime"] == "22:45"


async def test_public_config_falls_back_when_row_missing(client):
    """后台从没配过时，小程序仍要能启动。"""
    r = await client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["ritual"]["tolerance_minutes"] == 30
    assert r.json()["schedule"]["bedtime"] == "23:30"


async def test_public_config_falls_back_when_row_is_corrupt(client, session):
    """库里的 JSON 坏了，小程序也必须能启动——坏数据降级，阶段一定下的原则。"""
    session.add(AppConfig(id=1, data={"ritual": {"tolerance_minutes": "三十"}},
                          updated_by="oops"))
    await session.flush()
    r = await client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["ritual"]["tolerance_minutes"] == 30


async def test_public_config_still_needs_no_auth(client):
    r = await client.get("/api/v1/config")
    assert r.status_code == 200


# ---------- Redis ----------

async def test_save_invalidates_redis_cache(client, session):
    h = await _admin_headers(session)
    fake = AsyncMock()
    with patch("app.services.admin_config.get_redis", return_value=fake):
        await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    fake.delete.assert_awaited()


async def test_save_succeeds_when_redis_is_down(client, session):
    """Redis 挂了不能挡住保存。"""
    h = await _admin_headers(session)
    fake = AsyncMock()
    fake.delete.side_effect = ConnectionError("redis down")
    with patch("app.services.admin_config.get_redis", return_value=fake):
        r = await client.put("/api/v1/admin/config", json=_full_payload(), headers=h)
    assert r.status_code == 200
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_config.py -v
```

Expected: FAIL —— 大量 404

- [ ] **Step 3: 在 `app/repositories/admin.py` 追加**

```python
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import AppConfig

CONFIG_ROW_ID = 1


async def get_app_config(session: AsyncSession) -> AppConfig | None:
    return await session.get(AppConfig, CONFIG_ROW_ID)


async def upsert_app_config(session: AsyncSession, data: dict,
                            updated_by: str) -> AppConfig:
    """单行覆盖。用 ON CONFLICT 而非「先查后写」，避免并发下两个管理员各插一行。"""
    stmt = (
        pg_insert(AppConfig)
        .values(id=CONFIG_ROW_ID, data=data, updated_by=updated_by)
        .on_conflict_do_update(
            index_elements=[AppConfig.id],
            set_={"data": data, "updated_by": updated_by,
                  "updated_at": func.now()})
        .returning(AppConfig)
    )
    row = (await session.execute(stmt)).scalar_one()
    await session.flush()
    return row
```

同时把该文件顶部的 import 补成：

```python
import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminUser, AppConfig
```

- [ ] **Step 4: 在 `app/schemas/admin.py` 追加配置模型**

```python
from datetime import time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# 所有文案字段共用的约束。200 字是小程序单屏能读完的上限。
Copy = Field(min_length=1, max_length=200)
HHMM = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

# extra="forbid"：字段名打错必须报错。静默丢弃会让管理员以为保存成功了，
# 而配置直接驱动用户可见的判定，「以为保存了其实没有」是最坏的一类错。
_Strict = ConfigDict(extra="forbid")


class AppSection(BaseModel):
    model_config = _Strict
    name: str = Copy
    slogan: str = Copy
    home_question: str = Copy
    skip_tonight_enabled: bool
    onboarding_enabled: bool
    reduce_motion_default: bool
    anonymous_analytics_enabled: bool


class ScheduleSection(BaseModel):
    model_config = _Strict
    bedtime: str = HHMM
    wake_time: str = HHMM
    min_time: str = HHMM
    max_time: str = HHMM

    @model_validator(mode="after")
    def _window_not_empty(self):
        if self.min_time == self.max_time:
            raise ValueError(
                "资格窗口的上下界不得相同——窗口宽度为零意味着所有用户永远不合格")
        return self


class OnboardingSection(BaseModel):
    model_config = _Strict
    welcome_title: str = Copy
    guest_copy: str = Copy
    guide_rest: str = Copy
    guide_light: str = Copy
    guide_gift: str = Copy
    story_video_path: str = Field(min_length=1, max_length=256)
    story_poster: str = Field(min_length=1, max_length=256)
    story_status: str = Copy
    skip_story_enabled: bool


class RitualSection(BaseModel):
    model_config = _Strict
    tolerance_minutes: int = Field(ge=0, le=180)
    gratitude_count: int = Field(ge=1, le=5)
    plan_count: int = Field(ge=1, le=5)
    resistance_options: list[str] = Field(min_length=1, max_length=8)
    ritual_minutes: int = Field(ge=1, le=180)
    dim_minutes: int = Field(ge=0, le=60)
    goodnight_text: str = Copy
    interrupt_text: str = Copy
    resistance_reply: str = Copy
    stage_not_started_enabled: bool
    stage_wind_down_enabled: bool
    stage_quieting_enabled: bool
    stage_done_enabled: bool

    @field_validator("resistance_options")
    @classmethod
    def _options_nonblank(cls, v: list[str]) -> list[str]:
        for item in v:
            if not item.strip():
                raise ValueError("阻力选项不得为空白")
            if len(item) > 32:
                raise ValueError(f"阻力选项不得超过 32 字：{item[:10]}…")
        return v


class RecordsSection(BaseModel):
    model_config = _Strict
    journal_days: int = Field(ge=1, le=365)
    journal_empty_copy: str = Copy
    comparison_copy: str = Copy
    collection_limit: int = Field(ge=1, le=500)
    reward_timing: Literal["next-day", "immediate"]
    reward_copy: str = Copy
    collection_empty_copy: str = Copy
    random_art_enabled: bool
    image_fallback_enabled: bool


class AdminConfigPayload(BaseModel):
    model_config = _Strict
    app: AppSection
    schedule: ScheduleSection
    onboarding: OnboardingSection
    ritual: RitualSection
    records: RecordsSection


class ConfigChangeItem(BaseModel):
    path: str
    # 用 from_/to 而非 old/new：spec 的接口示例写的是 from/to，
    # from 是 Python 关键字，靠 alias 输出正确的 JSON 字段名。
    from_: object = Field(alias="from")
    to: object

    model_config = ConfigDict(populate_by_name=True)


class ConfigFieldError(BaseModel):
    field: str
    message: str


class ConfigDiffResponse(BaseModel):
    changes: list[ConfigChangeItem]
    valid: bool
    errors: list[ConfigFieldError]


class AdminConfigResponse(BaseModel):
    config: dict
    updated_by: str | None
    updated_at: datetime | None
```

- [ ] **Step 5: 建 `app/services/admin_config.py`**

```python
"""运营配置的读写编排。

【隐私硬约束】本文件不得引用 NightRecord / AnalyticsEvent / decrypt_*。

【坏数据必须降级】库里的 JSON 无论多离谱，公开的 GET /config 都必须能返回
一份可用的配置。小程序启动就要读它，让它 500 等于让所有用户开不了 App。
"""

import logging

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis, key
from app.domain.config import (
    DEFAULT_CONFIG, ConfigChange, RuntimeConfig, config_from_dict, config_to_dict,
    diff_config,
)
from app.models import AppConfig
from app.repositories import admin as admin_repo
from app.schemas.admin import AdminConfigPayload

logger = logging.getLogger("zhusheng")

CACHE_KEY_PARTS = ("config", "active")


async def load_active_config(session: AsyncSession) -> RuntimeConfig:
    """当前生效配置。查库优先，任何异常都回落 DEFAULT_CONFIG。"""
    try:
        row = await admin_repo.get_app_config(session)
    except Exception:
        logger.warning("读取 app_config 失败，回落默认配置", exc_info=True)
        return DEFAULT_CONFIG
    if row is None:
        return DEFAULT_CONFIG
    try:
        return config_from_dict(row.data)
    except (ValueError, TypeError):
        # 库里的 JSON 坏了。记日志，但绝不让小程序开不了机。
        logger.error("app_config.data 无法解析，回落默认配置", exc_info=True)
        return DEFAULT_CONFIG


async def current_dict(session: AsyncSession) -> dict:
    return config_to_dict(await load_active_config(session))


def validate(raw: dict) -> tuple[dict | None, list[dict]]:
    """返回 (规范化后的 dict 或 None, 逐字段错误)。"""
    try:
        payload = AdminConfigPayload.model_validate(raw)
    except ValidationError as exc:
        errors = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
                  for e in exc.errors()]
        return None, errors
    return payload.model_dump(), []


async def preview(session: AsyncSession, raw: dict) -> tuple[list[ConfigChange], list[dict]]:
    """dry-run：不写库，返回 (变动项, 错误项)。校验不过时变动项为空。"""
    normalized, errors = validate(raw)
    if normalized is None:
        return [], errors
    return diff_config(await current_dict(session), normalized), []


async def save(session: AsyncSession, raw: dict, username: str) -> AppConfig:
    """保存。调用方须保证 raw 已通过 AdminConfigPayload 校验。"""
    row = await admin_repo.upsert_app_config(session, raw, username)
    await invalidate_cache()
    return row


async def invalidate_cache() -> None:
    """保存即生效：删缓存，下一次 GET /config 重新查库。

    Redis 不可用时什么都不做——缓存本就没生效，正确性不受影响。
    """
    client = get_redis()
    if client is None:
        return
    try:
        await client.delete(key(*CACHE_KEY_PARTS))
    except Exception:
        logger.warning("配置缓存失效失败，Redis 可能不可用")
```

- [ ] **Step 6: 建 `app/api/v1/admin/config.py`**

```python
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.auth import current_admin
from app.core.db import get_session
from app.schemas.admin import (
    AdminConfigResponse, ConfigChangeItem, ConfigDiffResponse, ConfigFieldError,
)
from app.services import admin_config

router = APIRouter(tags=["admin"])


@router.get("/config", response_model=AdminConfigResponse)
async def read_config(_=Depends(current_admin),
                      session: AsyncSession = Depends(get_session)):
    from app.repositories import admin as admin_repo
    row = await admin_repo.get_app_config(session)
    return AdminConfigResponse(
        config=await admin_config.current_dict(session),
        updated_by=row.updated_by if row else None,
        updated_at=row.updated_at if row else None)


@router.put("/config")
async def write_config(payload: dict,
                       dry_run: bool = Query(False),
                       admin=Depends(current_admin),
                       session: AsyncSession = Depends(get_session)):
    """dry_run=true 时只算 diff 不写库；否则校验后写库。

    刻意接收裸 dict 而非 AdminConfigPayload：dry-run 需要把校验错误当成
    **数据**返回给前端逐字段标红，而不是让 FastAPI 直接抛 422。
    """
    if dry_run:
        changes, errors = await admin_config.preview(session, payload)
        return ConfigDiffResponse(
            changes=[ConfigChangeItem(path=c.path, **{"from": c.old}, to=c.new)
                     for c in changes],
            valid=not errors,
            errors=[ConfigFieldError(**e) for e in errors])

    normalized, errors = admin_config.validate(payload)
    if normalized is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "CONFIG_INVALID")
    row = await admin_config.save(session, normalized, admin.username)
    await session.commit()
    return AdminConfigResponse(config=normalized, updated_by=row.updated_by,
                               updated_at=row.updated_at)


@router.get("/config/export")
async def export_config(_=Depends(current_admin),
                        session: AsyncSession = Depends(get_session)):
    """下载当前配置的 JSON 快照。改动前手动存一份，是「单行覆盖」的唯一后悔药。"""
    data = await admin_config.current_dict(session)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return Response(
        content=body, media_type="application/json",
        headers={"Content-Disposition":
                 'attachment; filename="zhusheng-config.json"'})
```

`ConfigChangeItem(path=..., **{"from": ...}, to=...)` 这个写法能work是因为 `populate_by_name=True` 且 alias 是 `from`。如果 Pydantic 报错，改用 `ConfigChangeItem.model_validate({"path": c.path, "from": c.old, "to": c.new})`。

- [ ] **Step 7: 挂载到 `app/api/v1/admin/__init__.py`**

```python
from fastapi import APIRouter

from app.api.v1.admin import auth, config

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(auth.router)
admin_router.include_router(config.router)
```

- [ ] **Step 8: 改公开接口 `app/api/v1/config.py`**

整体替换为：

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.schemas.config import AssetsPayload, ConfigResponse, RitualPayload, SchedulePayload
from app.services import admin_config

router = APIRouter(tags=["config"])


@router.get("/config", response_model=ConfigResponse)
async def get_config(session: AsyncSession = Depends(get_session)):
    """公开接口：小程序启动即需要，不要求登录。

    查 app_config 优先，查不到或解析失败回落 domain/config.py 的常量。
    对外形状与阶段一完全一致——小程序端不需要任何改动。
    """
    c = await admin_config.load_active_config(session)
    return ConfigResponse(
        schedule=SchedulePayload(bedtime=c.schedule.bedtime, wake_time=c.schedule.wake_time,
                                 min_time=c.schedule.min_time, max_time=c.schedule.max_time),
        ritual=RitualPayload(tolerance_minutes=c.ritual.tolerance_minutes,
                             gratitude_count=c.ritual.gratitude_count,
                             plan_count=c.ritual.plan_count,
                             resistance_options=list(c.ritual.resistance_options)),
        assets=AssetsPayload(base_url=get_settings().asset_base_url.rstrip("/")))
```

> 注意：`ConfigResponse` 对外只暴露 schedule / ritual / assets 三组，**不含** app / onboarding / records。那三组是后台与前端渲染用的运营文案，小程序阶段一没有消费它们，此处不扩大公开接口的形状。阶段三小程序要用时再加，属于向后兼容的新增。

- [ ] **Step 9: 跑测试确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_config.py -v
```

Expected: 25 passed（其中 19 个是参数化的校验边界）

- [ ] **Step 10: 全量回归，特别盯 `test_config_api.py`**

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/python -m pytest tests/test_config_api.py tests/test_e2e_flow.py -v
```

Expected: 229 + 25 = 254 passed, 0 failed。`GET /config` 现在多了一个 `session` 依赖，`test_config_api.py` 若原本用不带 DB 的 client 调它，可能需要改用 `client` fixture —— 若确实需要改，**只改测试的 fixture 用法，不改断言**，并在小结里写明。

- [ ] **Step 11: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin): 运营配置读写、dry-run diff 与导出`

---

## Task 6: 艺术作品管理

复用已有的 `art_works` 表，**不加字段**。最需要小心的是删除：`rewards.art_id` 外键是
`ON DELETE RESTRICT`，被任何用户收藏过的作品在数据库层就删不掉。把这个
`IntegrityError` 干净地翻成 409，而不是让它冒泡成 500。

**Files:**
- Modify: `backend/app/repositories/art.py`（追加三个函数）
- Modify: `backend/app/schemas/admin.py`（追加作品模型）
- Create: `backend/app/services/admin_art.py`
- Create: `backend/app/api/v1/admin/art.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Test: `backend/tests/test_admin_art.py`

**Interfaces:**
- Consumes: `ArtWork`（既有）、`current_admin`（Task 4）、`app.core.assets.asset_url`（既有）
- Produces:
  - `app.repositories.art.list_for_admin(session, status: str | None, q: str | None) -> list[ArtWork]`
  - `app.repositories.art.count_rewards_for(session, art_id: str) -> int`
  - `app.schemas.admin.AdminArtCreate` / `AdminArtUpdate` / `AdminArtItem` / `AdminArtListResponse`
  - `app.services.admin_art.create` / `update` / `delete`

### 三种状态的语义（`CONTEXT.md` 已定义，此处只列判定）

| 状态 | `is_active` | `is_withdrawn` | 进抽卡池 | 已收藏用户可见 |
|---|---|---|---|---|
| 上架 | true | false | 是 | 是 |
| 下架 | false | false | 否 | **是** |
| 撤回 | 任意 | true | 否 | **否** |

撤回会让已收藏的用户也看不见，是为版权等法务原因留的。后台必须二次确认。

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_admin_art.py`：

```python
"""后台的艺术作品管理。"""
import uuid

import pytest

from app.core.password import hash_password
from app.core.security import create_admin_token
from app.models import AdminUser, ArtWork

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _admin_headers(session, username="artadmin") -> dict:
    admin = AdminUser(username=username, hashed_password=hash_password("x" * 16))
    session.add(admin)
    await session.flush()
    return {"Authorization": f"Bearer {create_admin_token(admin.id)}"}


def _payload(art_id="test-work") -> dict:
    return {
        "id": art_id,
        "title": "睡莲",
        "artist": "克劳德·莫奈",
        "year": "1906",
        "thumbnail": "art/water-lilies-thumb.jpg",
        "image": "art/water-lilies.jpg",
        "alt": "一池睡莲浮在墨绿水面上",
        "source": "Public domain, via Wikimedia Commons",
        "article": "莫奈在吉维尼的花园里画了两百多幅睡莲。",
    }


async def _make_art(session, art_id="existing", active=True, withdrawn=False) -> ArtWork:
    art = ArtWork(**{**_payload(art_id), "is_active": active,
                     "is_withdrawn": withdrawn})
    session.add(art)
    await session.flush()
    return art


# ---------- 列表 ----------

async def test_list_requires_admin_token(client):
    r = await client.get("/api/v1/admin/art")
    assert r.status_code == 401


async def test_list_includes_inactive_and_withdrawn(client, session):
    """后台要能看见全部三种状态——只看得见上架的后台没法把作品救回来。"""
    h = await _admin_headers(session)
    await _make_art(session, "up")
    await _make_art(session, "down", active=False)
    await _make_art(session, "gone", withdrawn=True)
    r = await client.get("/api/v1/admin/art", headers=h)
    assert r.status_code == 200
    ids = {i["id"] for i in r.json()["items"]}
    assert {"up", "down", "gone"} <= ids
    assert r.json()["total"] >= 3


async def test_list_filters_by_status(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "s-up")
    await _make_art(session, "s-down", active=False)
    await _make_art(session, "s-gone", withdrawn=True)

    up = await client.get("/api/v1/admin/art?status=active", headers=h)
    assert {i["id"] for i in up.json()["items"]} == {"s-up"}

    down = await client.get("/api/v1/admin/art?status=inactive", headers=h)
    assert {i["id"] for i in down.json()["items"]} == {"s-down"}

    gone = await client.get("/api/v1/admin/art?status=withdrawn", headers=h)
    assert {i["id"] for i in gone.json()["items"]} == {"s-gone"}


async def test_list_searches_title_and_artist(client, session):
    h = await _admin_headers(session)
    art = await _make_art(session, "q-target")
    art.title = "星夜"
    art.artist = "文森特·梵高"
    await session.flush()
    await _make_art(session, "q-other")

    by_title = await client.get("/api/v1/admin/art?q=星夜", headers=h)
    assert {i["id"] for i in by_title.json()["items"]} == {"q-target"}

    by_artist = await client.get("/api/v1/admin/art?q=梵高", headers=h)
    assert {i["id"] for i in by_artist.json()["items"]} == {"q-target"}


async def test_list_item_exposes_status_and_full_urls(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "shape")
    item = next(i for i in (await client.get("/api/v1/admin/art", headers=h)
                            ).json()["items"] if i["id"] == "shape")
    assert item["status"] == "active"
    assert item["thumbnail_url"].startswith("http")
    assert item["thumbnail"] == "art/water-lilies-thumb.jpg"   # 原始相对路径也要给


# ---------- 新增 ----------

async def test_create_art(client, session):
    h = await _admin_headers(session)
    r = await client.post("/api/v1/admin/art", json=_payload("brand-new"), headers=h)
    assert r.status_code == 201
    assert r.json()["id"] == "brand-new"
    assert r.json()["status"] == "active"
    assert await session.get(ArtWork, "brand-new") is not None


async def test_create_rejects_duplicate_id(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "dup")
    r = await client.post("/api/v1/admin/art", json=_payload("dup"), headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "ART_ID_TAKEN"


@pytest.mark.parametrize("field", ["title", "artist", "year", "thumbnail",
                                   "image", "alt", "source", "article"])
async def test_create_rejects_blank_required_field(client, session, field):
    """8 个必填字段。数据库有 CHECK 约束，但要在应用层挡住给出可读错误。"""
    h = await _admin_headers(session, f"blank-{field}")
    data = _payload(f"blank-{field}")
    data[field] = "   "
    r = await client.post("/api/v1/admin/art", json=data, headers=h)
    assert r.status_code == 422


async def test_create_rejects_bad_slug(client, session):
    h = await _admin_headers(session)
    r = await client.post("/api/v1/admin/art",
                          json=_payload("Not A Slug!"), headers=h)
    assert r.status_code == 422


async def test_create_requires_admin_token(client):
    r = await client.post("/api/v1/admin/art", json=_payload())
    assert r.status_code == 401


# ---------- 修改与状态流转 ----------

async def test_patch_updates_metadata(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "edit-me")
    r = await client.patch("/api/v1/admin/art/edit-me",
                           json={"title": "睡莲·黄昏"}, headers=h)
    assert r.status_code == 200
    assert r.json()["title"] == "睡莲·黄昏"
    assert r.json()["artist"] == "克劳德·莫奈"      # 未提交的字段不变


async def test_patch_deactivates_and_reactivates(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "toggle")
    off = await client.patch("/api/v1/admin/art/toggle",
                             json={"is_active": False}, headers=h)
    assert off.json()["status"] == "inactive"
    on = await client.patch("/api/v1/admin/art/toggle",
                            json={"is_active": True}, headers=h)
    assert on.json()["status"] == "active"


async def test_patch_withdraws(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "withdraw-me")
    r = await client.patch("/api/v1/admin/art/withdraw-me",
                           json={"is_withdrawn": True}, headers=h)
    assert r.json()["status"] == "withdrawn"


async def test_withdrawn_art_leaves_the_draw_pool(client, session):
    """状态改动必须真的影响抽卡池，不只是个标签。"""
    from app.repositories import art as art_repo
    h = await _admin_headers(session)
    await _make_art(session, "pool-check")
    assert "pool-check" in {a.id for a in await art_repo.active_pool(session)}
    await client.patch("/api/v1/admin/art/pool-check",
                       json={"is_withdrawn": True}, headers=h)
    assert "pool-check" not in {a.id for a in await art_repo.active_pool(session)}


async def test_patch_rejects_unknown_field(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "strict")
    r = await client.patch("/api/v1/admin/art/strict",
                           json={"titel": "拼错了"}, headers=h)
    assert r.status_code == 422


async def test_patch_missing_art_returns_404(client, session):
    h = await _admin_headers(session)
    r = await client.patch("/api/v1/admin/art/no-such-work",
                           json={"title": "x"}, headers=h)
    assert r.status_code == 404
    assert r.json()["code"] == "ART_NOT_FOUND"


# ---------- 删除 ----------

async def test_delete_unused_art(client, session):
    h = await _admin_headers(session)
    await _make_art(session, "delete-me")
    r = await client.delete("/api/v1/admin/art/delete-me", headers=h)
    assert r.status_code == 204
    assert await session.get(ArtWork, "delete-me") is None


async def test_delete_collected_art_returns_409(client, session):
    """rewards.art_id 是 ON DELETE RESTRICT。数据库会拒绝，我们把它翻成 409。"""
    from datetime import date, datetime, timezone

    from app.models import NightRecord, Reward, User
    h = await _admin_headers(session)
    await _make_art(session, "collected")

    user = User(openid=f"admin-art-{uuid.uuid4().hex}")
    session.add(user)
    await session.flush()
    night = NightRecord(user_id=user.id, ritual_date=date(2026, 8, 30),
                        is_eligible=True, late_minutes=0, reward_draw_count=1)
    session.add(night)
    await session.flush()
    session.add(Reward(user_id=user.id, night_record_id=night.id, art_id="collected",
                       revealed_at=datetime.now(timezone.utc)))
    await session.flush()

    r = await client.delete("/api/v1/admin/art/collected", headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "ART_IN_USE"
    assert await session.get(ArtWork, "collected") is not None    # 没被删掉


async def test_delete_missing_art_returns_404(client, session):
    h = await _admin_headers(session)
    r = await client.delete("/api/v1/admin/art/nope", headers=h)
    assert r.status_code == 404


async def test_delete_requires_admin_token(client, session):
    await _make_art(session, "protected")
    r = await client.delete("/api/v1/admin/art/protected")
    assert r.status_code == 401
```

> `NightRecord` / `Reward` / `User` 只在**测试**里 import，用来造出「被收藏过」的前置数据。
> Task 7 的 AST 扫描只针对 `app/api/v1/admin/` 与 `app/services/admin*.py`，不扫 `tests/`，两者不冲突。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_art.py -v
```

Expected: FAIL —— 全部 404

- [ ] **Step 3: 在 `app/repositories/art.py` 追加**

```python
from sqlalchemy import func, or_, select

from app.models import ArtWork, Reward


async def list_for_admin(session: AsyncSession, status: str | None = None,
                         q: str | None = None) -> list[ArtWork]:
    """后台列表：含下架与撤回。status ∈ {active, inactive, withdrawn, None}。"""
    stmt = select(ArtWork)
    if status == "active":
        stmt = stmt.where(ArtWork.is_active.is_(True), ArtWork.is_withdrawn.is_(False))
    elif status == "inactive":
        stmt = stmt.where(ArtWork.is_active.is_(False), ArtWork.is_withdrawn.is_(False))
    elif status == "withdrawn":
        stmt = stmt.where(ArtWork.is_withdrawn.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(ArtWork.title.ilike(like), ArtWork.artist.ilike(like),
                              ArtWork.id.ilike(like)))
    return list(await session.scalars(stmt.order_by(ArtWork.id)))


async def count_rewards_for(session: AsyncSession, art_id: str) -> int:
    """这幅作品被收藏了多少次。后台列表用它给出「不能删」的提示。"""
    return await session.scalar(
        select(func.count()).select_from(Reward).where(Reward.art_id == art_id)) or 0
```

- [ ] **Step 4: 在 `app/schemas/admin.py` 追加作品模型**

```python
NonBlank = Field(min_length=1, max_length=256)


def _reject_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("不得为空白")
    return v


class AdminArtCreate(BaseModel):
    model_config = _Strict

    # slug 手填：它是抽卡与收藏的稳定标识，自动生成会在改标题时漂移。
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = NonBlank
    artist: str = NonBlank
    year: str = Field(min_length=1, max_length=64)
    thumbnail: str = NonBlank
    image: str = NonBlank
    alt: str = NonBlank
    source: str = Field(min_length=1, max_length=2000)
    article: str = Field(min_length=1, max_length=20000)

    _nonblank = field_validator("title", "artist", "year", "thumbnail", "image",
                                "alt", "source", "article")(_reject_blank)


class AdminArtUpdate(BaseModel):
    model_config = _Strict

    title: str | None = Field(default=None, min_length=1, max_length=256)
    artist: str | None = Field(default=None, min_length=1, max_length=256)
    year: str | None = Field(default=None, min_length=1, max_length=64)
    thumbnail: str | None = Field(default=None, min_length=1, max_length=256)
    image: str | None = Field(default=None, min_length=1, max_length=256)
    alt: str | None = Field(default=None, min_length=1, max_length=256)
    source: str | None = Field(default=None, min_length=1, max_length=2000)
    article: str | None = Field(default=None, min_length=1, max_length=20000)
    is_active: bool | None = None
    is_withdrawn: bool | None = None

    @field_validator("title", "artist", "year", "thumbnail", "image", "alt",
                     "source", "article")
    @classmethod
    def _no_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("不得为空白")
        return v


class AdminArtItem(BaseModel):
    id: str
    title: str
    artist: str
    year: str
    thumbnail: str          # 原始相对路径，编辑表单要回填这个
    image: str
    alt: str
    source: str
    article: str
    is_active: bool
    is_withdrawn: bool
    status: Literal["active", "inactive", "withdrawn"]
    thumbnail_url: str      # 拼好 ASSET_BASE_URL 的完整地址，列表缩略图用
    image_url: str
    reward_count: int       # 被收藏次数；>0 时前端禁用删除按钮


class AdminArtListResponse(BaseModel):
    items: list[AdminArtItem]
    total: int
```

- [ ] **Step 5: 建 `app/services/admin_art.py`**

```python
"""后台的作品管理。

【隐私硬约束】本文件不得引用 NightRecord / AnalyticsEvent / decrypt_*。
统计「被收藏次数」只数 rewards 的行数，不读任何用户内容。
"""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.assets import asset_url
from app.models import ArtWork
from app.repositories import art as art_repo
from app.schemas.admin import AdminArtCreate, AdminArtItem, AdminArtUpdate


def _status(art: ArtWork) -> str:
    if art.is_withdrawn:
        return "withdrawn"
    return "active" if art.is_active else "inactive"


def to_item(art: ArtWork, reward_count: int) -> AdminArtItem:
    return AdminArtItem(
        id=art.id, title=art.title, artist=art.artist, year=art.year,
        thumbnail=art.thumbnail, image=art.image, alt=art.alt,
        source=art.source, article=art.article,
        is_active=art.is_active, is_withdrawn=art.is_withdrawn,
        status=_status(art),
        thumbnail_url=asset_url(art.thumbnail), image_url=asset_url(art.image),
        reward_count=reward_count)


async def get_or_404(session: AsyncSession, art_id: str) -> ArtWork:
    art = await session.get(ArtWork, art_id)
    if art is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ART_NOT_FOUND")
    return art


async def create(session: AsyncSession, payload: AdminArtCreate) -> ArtWork:
    if await session.get(ArtWork, payload.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_ID_TAKEN")
    art = ArtWork(**payload.model_dump())
    session.add(art)
    try:
        await session.flush()
    except IntegrityError as exc:
        # 并发下两个管理员填了同一个 slug；唯一约束是最终防线
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_ID_TAKEN") from exc
    return art


async def update(session: AsyncSession, art_id: str, payload: AdminArtUpdate) -> ArtWork:
    art = await get_or_404(session, art_id)
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(art, field_name, value)
    await session.flush()
    return art


async def delete(session: AsyncSession, art_id: str) -> None:
    """物理删除。被收藏过的作品删不掉——这是数据库层的保证，不是应用层的检查。

    先数一遍 rewards 只为给出快速、可读的错误；真正的防线是外键
    ON DELETE RESTRICT。两个管理员同时操作时，check-then-act 会漏，
    所以底下还要接住 IntegrityError。
    """
    art = await get_or_404(session, art_id)
    if await art_repo.count_rewards_for(session, art_id) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_IN_USE")
    await session.delete(art)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_IN_USE") from exc
```

- [ ] **Step 6: 建 `app/api/v1/admin/art.py`**

```python
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.auth import current_admin
from app.core.db import get_session
from app.repositories import art as art_repo
from app.schemas.admin import (
    AdminArtCreate, AdminArtItem, AdminArtListResponse, AdminArtUpdate,
)
from app.services import admin_art

router = APIRouter(tags=["admin"])


@router.get("/art", response_model=AdminArtListResponse)
async def list_art(status_filter: str | None = Query(None, alias="status"),
                   q: str | None = Query(None, max_length=64),
                   _=Depends(current_admin),
                   session: AsyncSession = Depends(get_session)):
    works = await art_repo.list_for_admin(session, status_filter, q)
    items = [admin_art.to_item(a, await art_repo.count_rewards_for(session, a.id))
             for a in works]
    return AdminArtListResponse(items=items, total=len(items))


@router.post("/art", response_model=AdminArtItem, status_code=status.HTTP_201_CREATED)
async def create_art(payload: AdminArtCreate, _=Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    art = await admin_art.create(session, payload)
    await session.commit()
    return admin_art.to_item(art, 0)


@router.patch("/art/{art_id}", response_model=AdminArtItem)
async def update_art(art_id: str, payload: AdminArtUpdate, _=Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    art = await admin_art.update(session, art_id, payload)
    count = await art_repo.count_rewards_for(session, art_id)
    await session.commit()
    return admin_art.to_item(art, count)


@router.delete("/art/{art_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_art(art_id: str, _=Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    await admin_art.delete(session, art_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 7: 挂载到 `app/api/v1/admin/__init__.py`**

```python
from fastapi import APIRouter

from app.api.v1.admin import art, auth, config

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(auth.router)
admin_router.include_router(config.router)
admin_router.include_router(art.router)
```

- [ ] **Step 8: 跑测试确认通过**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_art.py -v
```

Expected: 25 passed（含 8 个参数化的必填字段）

- [ ] **Step 9: 全量回归**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 254 + 25 = 279 passed, 0 failed

- [ ] **Step 10: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin): 艺术作品的增删改查与三状态流转`

---

## Task 7: 错误信息补全 + 隐私 AST 把守

两件收尾的事，一起做完后端就完整了。

**Files:**
- Modify: `backend/app/core/errors.py`
- Create: `backend/tests/test_admin_privacy.py`
- Modify: `backend/tests/test_errors.py`（只加，不改既有断言）

**Interfaces:**
- Consumes: 全部 admin 模块（Task 4–6）
- Produces: `app.core.errors.ERROR_MESSAGES: dict[str, str]`

### 为什么在这里修 `message`

阶段一 `_envelope(code, code)` 让 `message` 等于错误码本身，小程序端用一张码→中文映射表兜底。后台**不重复这套兜底** —— 根因在后端，且后台是新代码，此时修比日后修便宜。已确认无任何现有测试断言 `message` 的值（只断言 `code`），小程序端优先用本地映射、完全忽略后端的 `message`，因此这次修改对已交付的两端都是安全的。

- [ ] **Step 1: 写失败测试（隐私）**

新建 `backend/tests/test_admin_privacy.py`：

```python
"""隐私硬约束的守门测试。

管理后台不提供任何查看用户个人数据的接口。这条约束靠 AST 扫描钉死，
防止阶段三做数据看板时顺手越界——那时改起来就贵了。

用 AST 而不是 grep：grep 会被注释和字符串里的同名词误伤，
AST 只看真正的标识符引用。
"""
import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parent.parent / "app"

# 这些名字一旦出现在 admin 代码里，就意味着后台能碰用户数据了
FORBIDDEN = {"decrypt_text", "decrypt_list", "NightRecord", "AnalyticsEvent"}


def _admin_source_files() -> list[Path]:
    files = sorted((APP / "api" / "v1" / "admin").rglob("*.py"))
    files += sorted((APP / "services").glob("admin*.py"))
    return [f for f in files if f.name != "__pycache__"]


def test_there_are_admin_files_to_scan():
    """守门测试自身的守门：文件挪走了要红，不能默默扫了个空集。"""
    files = _admin_source_files()
    assert len(files) >= 5, f"只找到 {len(files)} 个 admin 源文件，扫描范围可能失效了"


@pytest.mark.parametrize("path", _admin_source_files(), ids=lambda p: p.name)
def test_admin_module_never_touches_user_data(path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            found.add(node.id)
        elif isinstance(node, ast.Attribute):
            found.add(node.attr)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                found.add(alias.name.split(".")[-1])
                if alias.asname:
                    found.add(alias.asname)
            if isinstance(node, ast.ImportFrom) and node.module:
                found.update(node.module.split("."))

    leaked = FORBIDDEN & found
    assert not leaked, (
        f"{path.relative_to(APP.parent)} 引用了 {sorted(leaked)}。"
        "管理后台不得读取用户夜记、匿名事件，也不得解密任何正文。"
    )


def test_no_admin_route_mentions_crypto_module(path=None):
    """连 import app.core.crypto 都不允许——引进来就迟早会用。"""
    for f in _admin_source_files():
        tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                assert "crypto" not in node.module, f"{f.name} 导入了 {node.module}"
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert "crypto" not in alias.name, f"{f.name} 导入了 {alias.name}"


def test_admin_routes_expose_no_user_endpoints():
    """从实际挂载的路由表确认：admin 前缀下没有任何用户相关路径。"""
    from app.main import create_app

    app = create_app()
    admin_paths = [r.path for r in app.routes
                   if getattr(r, "path", "").startswith("/api/v1/admin")]
    assert admin_paths, "没有找到任何 admin 路由"
    for path in admin_paths:
        lowered = path.lower()
        for word in ("user", "night", "record", "journal", "event", "gratitude", "plan"):
            assert word not in lowered, f"admin 路由 {path} 含可疑路径段 {word!r}"
```

- [ ] **Step 2: 跑隐私测试**

```bash
cd backend && .venv/bin/python -m pytest tests/test_admin_privacy.py -v
```

Expected: 全部 PASS（Task 4–6 的实现本就没碰这些名字）。**如果红了，说明前面某个任务越界了，先修实现，不要改这条测试的 `FORBIDDEN` 集合。**

- [ ] **Step 3: 写失败测试（错误信息）**

在 `backend/tests/test_errors.py` **末尾追加**（既有断言一行不改）：

```python
def test_error_envelope_carries_chinese_message():
    """message 必须是给人看的中文，不是错误码的复读。"""
    from app.core.errors import ERROR_MESSAGES, _envelope

    body = _envelope("ART_IN_USE", ERROR_MESSAGES["ART_IN_USE"])
    assert body["code"] == "ART_IN_USE"
    assert body["message"] != "ART_IN_USE"
    assert "收藏" in body["message"]


def test_every_error_code_raised_in_app_has_a_message():
    """新增错误码时忘了配文案，这条会红。"""
    import ast
    from pathlib import Path

    from app.core.errors import ERROR_MESSAGES

    app_dir = Path(__file__).resolve().parent.parent / "app"
    raised: set[str] = set()
    for path in app_dir.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            # 约定：HTTPException 的第二个位置参数是错误码字符串
            if (isinstance(node, ast.Call)
                    and getattr(node.func, "id", None) == "HTTPException"
                    and len(node.args) >= 2
                    and isinstance(node.args[1], ast.Constant)
                    and isinstance(node.args[1].value, str)):
                raised.add(node.args[1].value)

    missing = sorted(raised - set(ERROR_MESSAGES))
    assert not missing, f"这些错误码没有中文文案：{missing}"


@pytest.mark.asyncio(loop_scope="session")
async def test_http_error_response_has_readable_message(client):
    r = await client.get("/api/v1/admin/me")
    assert r.status_code == 401
    assert r.json()["code"] == "TOKEN_MISSING"
    assert r.json()["message"] == "请先登录"
```

若 `test_errors.py` 顶部没有 `import pytest`，补上。

- [ ] **Step 4: 跑测试确认失败**

```bash
cd backend && .venv/bin/python -m pytest tests/test_errors.py -v
```

Expected: FAIL —— `ImportError: cannot import name 'ERROR_MESSAGES'`

- [ ] **Step 5: 改 `app/core/errors.py`**

在 `_envelope` 定义之前插入映射表：

```python
# 错误码 → 面向用户的中文。阶段一这里是 _envelope(code, code)，
# message 等于错误码本身，前端只能自己维护一张映射表。根因在这里，就在这里修。
#
# 新增错误码时必须同时在这里加一行——tests/test_errors.py 会扫描全部
# HTTPException 的错误码，漏配就红。
ERROR_MESSAGES: dict[str, str] = {
    # 通用
    "HTTP_ERROR": "请求未能完成",
    "VALIDATION_ERROR": "请求参数不合法",
    "INTERNAL_ERROR": "服务器内部错误",
    # 鉴权
    "TOKEN_MISSING": "请先登录",
    "TOKEN_INVALID": "登录已失效，请重新登录",
    "TOKEN_KIND_MISMATCH": "登录已失效，请重新登录",
    # 管理后台
    "ADMIN_LOGIN_FAILED": "用户名或密码不正确",
    "ADMIN_INACTIVE": "该账号已停用",
    "ADMIN_NOT_FOUND": "登录已失效，请重新登录",
    "TOO_MANY_ATTEMPTS": "尝试次数过多，请一分钟后再试",
    "PASSWORD_TOO_LONG": "密码过长（上限 72 字节，中文一字算 3 字节）",
    "CONFIG_INVALID": "配置不合法，请检查标红的字段",
    # 作品
    "ART_NOT_FOUND": "找不到这幅作品",
    "ART_WITHDRAWN": "这幅作品已撤回",
    "ART_IN_USE": "这幅作品已被收藏，只能下架或撤回，不能删除",
    "ART_ID_TAKEN": "这个标识已被占用，请换一个",
}
```

> `ADMIN_NOT_FOUND` 与 `TOKEN_KIND_MISMATCH` 刻意都说「登录已失效」，不说「账号不存在」——
> 未登录者不该从错误信息里推断出任何账号是否存在。

再把 `_http` 处理器里的 `_envelope(code, code)` 改成：

```python
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code, ERROR_MESSAGES.get(code, "请求未能完成")),
            headers=getattr(exc, "headers", None))
```

**兜底用「请求未能完成」而不是 `code`**：漏配文案时用户看到的是一句中文，不是一串英文大写。同时 `test_every_error_code_raised_in_app_has_a_message` 会在开发期就把漏配拦下。

- [ ] **Step 6: 跑测试，把漏配的错误码补齐**

```bash
cd backend && .venv/bin/python -m pytest tests/test_errors.py -v
```

如果 `test_every_error_code_raised_in_app_has_a_message` 报出 `ERROR_MESSAGES` 里没有的码（阶段一的路由里还有一些，如 `NIGHT_NOT_FOUND` 之类），把它们逐条补进映射表，文案要求：一句话、中文、不暴露内部实现、不透露某个资源是否存在给未授权者。补完再跑。

Expected: 全绿

- [ ] **Step 7: 全量回归**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 279 + 4（隐私 3 + 错误 3，其中隐私的参数化按文件数展开）以上 passed, 0 failed。**特别确认 `tests/test_auth.py`、`tests/test_ritual_api.py`、`tests/test_reward_api.py` 仍全绿** —— 它们断言的是 `code`，`message` 变了不该影响它们。若有任何一条因 `message` 变化而红，说明阶段一确实有测试依赖了这个值，此时**改测试而非回退修复**，并在小结里写明改了哪几条。

- [ ] **Step 8: 手工验证整套后端**

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8010 &
sleep 3
curl -s localhost:8010/api/v1/config | head -c 300; echo
curl -s -X POST localhost:8010/api/v1/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"devadmin","password":"<开发期密码，见本地记录>"}'; echo
curl -s localhost:8010/api/v1/admin/me; echo
curl -s localhost:8010/openapi.json | python3 -c "
import json,sys
paths = json.load(sys.stdin)['paths']
for p in sorted(paths):
    if 'admin' in p: print(' ', p, sorted(paths[p]))
"
kill %1
```

Expected: `/config` 返回配置；登录返回 token；未带 token 的 `/me` 返回 `{"code":"TOKEN_MISSING","message":"请先登录"}`；OpenAPI 里有 9 条 admin 路径。

- [ ] **Step 9: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin): 补全错误文案并加隐私 AST 守门测试`

**后端到此完整。** 9 个接口全部就绪，可以开始前端。

---

## Task 8: `admin/` 脚手架与设计令牌

**Files:**
- Create: `admin/package.json` / `admin/vite.config.ts` / `admin/tsconfig.json` / `admin/tsconfig.node.json` / `admin/index.html` / `admin/.gitignore`
- Create: `admin/src/main.tsx` / `admin/src/App.tsx`
- Create: `admin/src/styles/tokens.css` / `admin/src/styles/base.css`
- Test: `admin/src/styles/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: 可 `npm run dev` / `npm run build` / `npm run test` 的工程；全局 CSS 变量

环境要求：Node ≥ 20.19（Vite 8 的引擎约束）。当前机器 v24.18.0，满足。

### 设计令牌逐字取自原型

下面 15 个值是从 `prototype/zhusheng-admin.html` 的 `:root` 里**原样抄下来**的，
不是我编的近似色。**实现时不要改动这些十六进制值**，改了就与原型脱节。

- [ ] **Step 1: 建工程骨架**

```bash
mkdir -p admin/src/{api,auth,layout,modules,components,styles}
cd admin
```

`admin/package.json`：

```json
{
  "name": "zhusheng-admin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.18.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^6.1.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.9.3",
    "vite": "^8.2.2",
    "vitest": "^4.1.11"
  }
}
```

> 装了 `@testing-library/react`。阶段一小程序端最大的一处缺口是「13 个测试文件全是纯逻辑，
> 12 个页面组件零渲染覆盖」——那是终审才发现的。这次从第一天就把渲染测试装上。

`admin/vite.config.ts`：

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // 开发期把 /api 代到本地后端，与生产的 Nginx 同源反代形状一致，
    // 因此后端默认不需要开 CORS。
    proxy: { '/api': { target: 'http://127.0.0.1:8010', changeOrigin: true },
             '/static': { target: 'http://127.0.0.1:8010', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})
```

`admin/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`admin/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>烛生 · 管理后台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`admin/.gitignore`：

```
node_modules
dist
*.local
```

`admin/src/setupTests.ts`：

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: 装依赖**

```bash
cd admin && npm install
```

Expected: 安装成功，`npm ls vite` 显示 8.x

- [ ] **Step 3: 写失败测试（令牌）**

新建 `admin/src/styles/__tests__/tokens.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 设计令牌必须与原型逐字一致。
 *
 * 阶段一在小程序端出过一次事故：计划里写着「令牌取自原型的 CSS 变量」，
 * 但那五个十六进制值在原型里一次都没出现过——是编的。这条测试让「取自原型」
 * 这句话变成可执行的断言。
 */
const PROTOTYPE = resolve(__dirname, '../../../../prototype/zhusheng-admin.html')
const TOKENS = resolve(__dirname, '../tokens.css')

// 从 prototype/zhusheng-admin.html 的 :root 逐字抄下
const EXPECTED: Record<string, string> = {
  '--bg': '#f7f6f8',
  '--surface': '#fffdfb',
  '--soft': '#f1eef3',
  '--primary-soft': '#eee8f2',
  '--ink': '#594e5f',
  '--muted': '#716575',
  '--primary': '#806890',
  '--primary-deep': '#675472',
  '--border': '#e5dfe5',
  '--success': '#526f59',
  '--success-bg': '#eaf0e9',
  '--warn': '#80613d',
  '--warn-bg': '#f5ecdf',
  '--danger': '#95536a',
}

describe('设计令牌', () => {
  const prototype = readFileSync(PROTOTYPE, 'utf-8')
  const tokens = readFileSync(TOKENS, 'utf-8')

  it.each(Object.entries(EXPECTED))('%s 出现在原型里', (name, value) => {
    expect(prototype).toContain(`${name}:${value}`)
  })

  it.each(Object.entries(EXPECTED))('%s 在 tokens.css 里取同一个值', (name, value) => {
    expect(tokens).toMatch(new RegExp(`${name}\\s*:\\s*${value}\\s*;`))
  })

  it('没有遗漏原型里的任何一个颜色令牌', () => {
    const inPrototype = [...prototype.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)]
      .map((m) => m[1])
    const unique = [...new Set(inPrototype)]
    expect(unique.sort()).toEqual(Object.keys(EXPECTED).sort())
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

```bash
cd admin && npm test
```

Expected: FAIL —— `ENOENT: no such file or directory ... tokens.css`

- [ ] **Step 5: 写 `admin/src/styles/tokens.css`**

```css
/* 设计令牌。逐字取自 prototype/zhusheng-admin.html 的 :root。
   src/styles/__tests__/tokens.test.ts 会比对两边，改这里必须同时对得上原型。 */
:root {
  --bg: #f7f6f8;
  --surface: #fffdfb;
  --soft: #f1eef3;
  --primary-soft: #eee8f2;
  --ink: #594e5f;
  --muted: #716575;
  --primary: #806890;
  --primary-deep: #675472;
  --border: #e5dfe5;
  --success: #526f59;
  --success-bg: #eaf0e9;
  --warn: #80613d;
  --warn-bg: #f5ecdf;
  --danger: #95536a;

  --shadow: 0 10px 30px rgba(78, 61, 88, 0.07);
  --sidebar: 220px;
  --r: 18px;
  --z-nav: 20;
  --z-overlay: 80;
  --z-toast: 100;

  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}
```

- [ ] **Step 6: 写 `admin/src/styles/base.css`**

```css
@import './tokens.css';

* { box-sizing: border-box; }

body {
  margin: 0;
  min-width: 960px;          /* 后台是 PC 专用，不做响应式 */
  background: var(--bg);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.55;
}

button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
a { color: inherit; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  padding: 20px 24px;
}

.btn {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 8px 16px;
}
.btn.primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.btn.primary:hover { background: var(--primary-deep); }
.btn.danger { color: var(--danger); border-color: var(--danger); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.input, .textarea, .select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--surface);
}
.input:focus, .textarea:focus, .select:focus {
  outline: 2px solid var(--primary-soft);
  border-color: var(--primary);
}
.input[aria-invalid='true'], .textarea[aria-invalid='true'] { border-color: var(--danger); }

.field-error { color: var(--danger); font-size: 12px; margin-top: 4px; }
.field-hint { color: var(--muted); font-size: 12px; margin-top: 4px; }
```

- [ ] **Step 7: 写入口**

`admin/src/main.tsx`：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import './styles/base.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`admin/src/App.tsx`（本任务先放一个占位，Task 9 换成真正的路由表）：

```tsx
export default function App() {
  return <div className="card">烛生管理后台</div>
}
```

- [ ] **Step 8: 跑测试与构建**

```bash
cd admin && npm test && npm run typecheck && npm run build
```

Expected: 令牌测试 29 项全过；typecheck 无错；`dist/` 生成

- [ ] **Step 9: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin-ui): Vite + React 脚手架与设计令牌`

---

## Task 9: API 类型、客户端、登录页、路由守卫

**Files:**
- Create: `admin/src/api/types.ts` / `client.ts` / `endpoints.ts`
- Create: `admin/src/auth/useAuth.tsx` / `LoginPage.tsx` / `RequireAuth.tsx`
- Modify: `admin/src/App.tsx`
- Test: `admin/src/api/__tests__/client.test.ts`、`admin/src/auth/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Consumes: 后端 Task 4–7 的 9 个接口
- Produces:
  - `types.ts`：`AdminConfig`（5 组）、`ConfigChange`、`ConfigDiff`、`ArtItem`、`ArtStatus`、`AdminMe`、`ApiError`
  - `client.ts`：`request<T>(path, init?) -> Promise<T>`、`setToken(t)`、`getToken()`、`clearToken()`、`ApiError` 类
  - `endpoints.ts`：`login` / `fetchMe` / `fetchConfig` / `previewConfig` / `saveConfig` / `exportConfigUrl` / `fetchArt` / `createArt` / `updateArt` / `deleteArt`
  - `useAuth.tsx`：`AuthProvider`、`useAuth() -> {me, loading, signIn, signOut}`

### token 存哪里

存 `sessionStorage`，不存 `localStorage`。8 小时的管理 token 关掉标签页就该没了；
`localStorage` 会让它在共用电脑上一直躺着。这不能防 XSS —— 真正防 XSS 的是不
`dangerouslySetInnerHTML`、不 `eval`，本项目两者都没有。

- [ ] **Step 1: 写 `admin/src/api/types.ts`**

★ 独立定义，**不从小程序共享**。防漂移靠 Task 13 的契约测试。

```ts
/**
 * 后台的 API 类型。
 *
 * ★ 刻意与 miniprogram/ 完全独立，不共享任何文件。代价是可能漂移，
 * 由 src/api/__tests__/contract.test.ts 与后端 /openapi.json 逐字段比对来兜。
 * 收益是两个前端零耦合——改小程序不会碰到后台，反之亦然。
 *
 * 字段名与后端的 snake_case 保持一致，不在这一层做 camelCase 转换：
 * 多一层映射就多一处可能漂移的地方，而契约测试只能比对到映射之前。
 */

export interface AppSection {
  name: string
  slogan: string
  home_question: string
  skip_tonight_enabled: boolean
  onboarding_enabled: boolean
  reduce_motion_default: boolean
  anonymous_analytics_enabled: boolean
}

export interface ScheduleSection {
  bedtime: string        // "HH:MM"
  wake_time: string
  min_time: string
  max_time: string
}

export interface OnboardingSection {
  welcome_title: string
  guest_copy: string
  guide_rest: string
  guide_light: string
  guide_gift: string
  story_video_path: string
  story_poster: string
  story_status: string
  skip_story_enabled: boolean
}

export interface RitualSection {
  tolerance_minutes: number
  gratitude_count: number
  plan_count: number
  resistance_options: string[]
  ritual_minutes: number
  dim_minutes: number
  goodnight_text: string
  interrupt_text: string
  resistance_reply: string
  stage_not_started_enabled: boolean
  stage_wind_down_enabled: boolean
  stage_quieting_enabled: boolean
  stage_done_enabled: boolean
}

export interface RecordsSection {
  journal_days: number
  journal_empty_copy: string
  comparison_copy: string
  collection_limit: number
  reward_timing: 'next-day' | 'immediate'
  reward_copy: string
  collection_empty_copy: string
  random_art_enabled: boolean
  image_fallback_enabled: boolean
}

export interface AdminConfig {
  app: AppSection
  schedule: ScheduleSection
  onboarding: OnboardingSection
  ritual: RitualSection
  records: RecordsSection
}

export type ConfigGroup = keyof AdminConfig

export interface AdminConfigResponse {
  config: AdminConfig
  updated_by: string | null
  updated_at: string | null
}

export interface ConfigChange {
  path: string
  from: unknown
  to: unknown
}

export interface ConfigFieldError {
  field: string
  message: string
}

export interface ConfigDiff {
  changes: ConfigChange[]
  valid: boolean
  errors: ConfigFieldError[]
}

export type ArtStatus = 'active' | 'inactive' | 'withdrawn'

export interface ArtItem {
  id: string
  title: string
  artist: string
  year: string
  thumbnail: string
  image: string
  alt: string
  source: string
  article: string
  is_active: boolean
  is_withdrawn: boolean
  status: ArtStatus
  thumbnail_url: string
  image_url: string
  reward_count: number
}

export interface ArtListResponse {
  items: ArtItem[]
  total: number
}

export type ArtCreate = Pick<
  ArtItem,
  'id' | 'title' | 'artist' | 'year' | 'thumbnail' | 'image' | 'alt' | 'source' | 'article'
>

export type ArtUpdate = Partial<Omit<ArtCreate, 'id'>> & {
  is_active?: boolean
  is_withdrawn?: boolean
}

export interface AdminMe {
  username: string
  last_login_at: string | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}
```

- [ ] **Step 2: 写失败测试（客户端）**

新建 `admin/src/api/__tests__/client.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, clearToken, getToken, request, setToken } from '../client'

describe('API 客户端', () => {
  beforeEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })
  afterEach(() => clearToken())

  const ok = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  it('把 token 放进 Authorization 头', async () => {
    setToken('tok-123')
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ ok: true }))
    await request('/api/v1/admin/me')
    const init = spy.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-123')
  })

  it('没有 token 时不发 Authorization 头', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ ok: true }))
    await request('/api/v1/config')
    const init = spy.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })

  it('把错误信封抛成带 code 与 message 的 ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ code: 'ART_IN_USE', message: '这幅作品已被收藏，只能下架或撤回，不能删除' }, 409),
    )
    await expect(request('/api/v1/admin/art/x')).rejects.toThrow(ApiError)
    try {
      await request('/api/v1/admin/art/x')
    } catch (e) {
      const err = e as ApiError
      expect(err.status).toBe(409)
      expect(err.code).toBe('ART_IN_USE')
      // 直接用后端的 message——后端已在 Task 7 补全，前端不再维护第二张映射表
      expect(err.message).toContain('已被收藏')
    }
  })

  it('后端没给 message 时用兜底文案，不显示错误码', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ code: 'WEIRD_CODE' }, 500))
    try {
      await request('/x')
    } catch (e) {
      expect((e as ApiError).message).toBe('出了点问题，请稍后再试')
      expect((e as ApiError).message).not.toContain('WEIRD_CODE')
    }
  })

  it('响应不是 JSON 时也抛可读的 ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    )
    await expect(request('/x')).rejects.toThrow(ApiError)
  })

  it('网络中断时抛 ApiError 而不是原始 TypeError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    try {
      await request('/x')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).code).toBe('NETWORK_ERROR')
    }
  })

  it('401 时清掉 token', async () => {
    setToken('stale')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ code: 'TOKEN_INVALID' }, 401))
    await expect(request('/api/v1/admin/me')).rejects.toThrow(ApiError)
    expect(getToken()).toBeNull()
  })

  it('204 无响应体时返回 undefined 而不是解析失败', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await expect(request('/api/v1/admin/art/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('token 存在 sessionStorage 而不是 localStorage', () => {
    setToken('tok-abc')
    expect(sessionStorage.getItem('zhusheng.admin.token')).toBe('tok-abc')
    expect(localStorage.getItem('zhusheng.admin.token')).toBeNull()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd admin && npm test -- client
```

Expected: FAIL —— 找不到 `../client`

- [ ] **Step 4: 写 `admin/src/api/client.ts`**

```ts
/**
 * fetch 封装。
 *
 * 错误文案直接用后端的 message——后端已补全中文（app/core/errors.py 的
 * ERROR_MESSAGES）。这里刻意不再维护一张码→中文的映射表：那正是阶段一在
 * 小程序端做过、并被认定为「治标」的做法，根因已在后端修掉。
 */

const TOKEN_KEY = 'zhusheng.admin.token'
const FALLBACK_MESSAGE = '出了点问题，请稍后再试'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// sessionStorage 而非 localStorage：关掉标签页 token 就该消失，
// 共用电脑上不留一张 8 小时有效的通行证。
export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行')
  }

  if (response.status === 401) clearToken()

  if (response.status === 204) return undefined as T

  let body: unknown = undefined
  const text = await response.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
  }

  if (!response.ok) {
    const envelope = (body ?? {}) as { code?: string; message?: string; detail?: unknown }
    throw new ApiError(
      response.status,
      envelope.code ?? 'HTTP_ERROR',
      envelope.message || FALLBACK_MESSAGE,
      envelope.detail,
    )
  }

  return body as T
}
```

- [ ] **Step 5: 写 `admin/src/api/endpoints.ts`**

```ts
import { request } from './client'
import type {
  AdminConfig, AdminConfigResponse, AdminMe, ArtCreate, ArtItem, ArtListResponse,
  ArtStatus, ArtUpdate, ConfigDiff, TokenResponse,
} from './types'

const BASE = '/api/v1/admin'

export const login = (username: string, password: string) =>
  request<TokenResponse>(`${BASE}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const fetchMe = () => request<AdminMe>(`${BASE}/me`)

export const fetchConfig = () => request<AdminConfigResponse>(`${BASE}/config`)

export const previewConfig = (config: AdminConfig) =>
  request<ConfigDiff>(`${BASE}/config?dry_run=true`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })

export const saveConfig = (config: AdminConfig) =>
  request<AdminConfigResponse>(`${BASE}/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })

export const exportConfigUrl = `${BASE}/config/export`

export const fetchArt = (status?: ArtStatus | '', q?: string) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (q) params.set('q', q)
  const query = params.toString()
  return request<ArtListResponse>(`${BASE}/art${query ? `?${query}` : ''}`)
}

export const createArt = (payload: ArtCreate) =>
  request<ArtItem>(`${BASE}/art`, { method: 'POST', body: JSON.stringify(payload) })

export const updateArt = (id: string, payload: ArtUpdate) =>
  request<ArtItem>(`${BASE}/art/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const deleteArt = (id: string) =>
  request<void>(`${BASE}/art/${encodeURIComponent(id)}`, { method: 'DELETE' })
```

> `exportConfigUrl` 是常量而非函数：导出走浏览器直接下载，但那个请求需要
> `Authorization` 头，`<a href>` 带不了。**因此导出按钮必须用 fetch 拿到内容再
> 造 Blob 下载**，不能用裸链接。Task 11 的实现里有具体写法。

- [ ] **Step 6: 写 `admin/src/auth/useAuth.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { clearToken, getToken, setToken } from '../api/client'
import { fetchMe, login as loginRequest } from '../api/endpoints'
import type { AdminMe } from '../api/types'

interface AuthState {
  me: AdminMe | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 刷新页面后用 sessionStorage 里的 token 复活会话。
    // token 过期或账号被停用时 /me 会 401/403，这里静默登出。
    if (!getToken()) {
      setLoading(false)
      return
    }
    fetchMe()
      .then(setMe)
      .catch(() => {
        clearToken()
        setMe(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const { access_token } = await loginRequest(username, password)
    setToken(access_token)
    setMe(await fetchMe())
  }, [])

  const signOut = useCallback(() => {
    clearToken()
    setMe(null)
  }, [])

  return (
    <AuthContext.Provider value={{ me, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
```

- [ ] **Step 7: 写失败测试（登录页）**

新建 `admin/src/auth/__tests__/LoginPage.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToken } from '../../api/client'
import * as endpoints from '../../api/endpoints'
import { ApiError } from '../../api/client'
import LoginPage from '../LoginPage'
import { AuthProvider } from '../useAuth'

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )

describe('登录页', () => {
  beforeEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })

  it('渲染用户名与密码输入框', async () => {
    renderPage()
    expect(await screen.findByLabelText('用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
  })

  it('密码框的 type 是 password', async () => {
    renderPage()
    expect(await screen.findByLabelText('密码')).toHaveAttribute('type', 'password')
  })

  it('提交后调用登录接口', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({
      access_token: 't', token_type: 'bearer', expires_in: 28800,
    })
    vi.spyOn(endpoints, 'fetchMe').mockResolvedValue({
      username: 'alice', last_login_at: null,
    })
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('alice', 'secret-password'))
  })

  it('登录失败时显示后端返回的中文错误', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(
      new ApiError(401, 'ADMIN_LOGIN_FAILED', '用户名或密码不正确'),
    )
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码不正确')
  })

  it('限流时显示 429 的提示', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(
      new ApiError(429, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请一分钟后再试'),
    )
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'x')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('一分钟后再试')
  })

  it('提交中禁用按钮，防止重复提交把自己限流掉', async () => {
    let resolve!: (v: unknown) => void
    vi.spyOn(endpoints, 'login').mockReturnValue(
      new Promise((r) => { resolve = r }) as never,
    )
    vi.spyOn(endpoints, 'fetchMe').mockResolvedValue({
      username: 'alice', last_login_at: null,
    })
    renderPage()
    await userEvent.type(await screen.findByLabelText('用户名'), 'alice')
    await userEvent.type(screen.getByLabelText('密码'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled())
    expect(screen.getByRole('button')).toHaveTextContent('登录中…')

    resolve({ access_token: 't', token_type: 'bearer', expires_in: 28800 })
  })

  it('用户名为空时不发请求', async () => {
    const login = vi.spyOn(endpoints, 'login')
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '登录' }))
    expect(login).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 8: 写 `admin/src/auth/LoginPage.tsx`**

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../api/client'
import { useAuth } from './useAuth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    setError(null)
    try {
      await signIn(username.trim(), password)
    } catch (err) {
      // 直接用后端的中文 message，不在前端二次映射错误码
      setError(err instanceof ApiError ? err.message : '出了点问题，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form className="card" onSubmit={onSubmit} style={{ width: 360 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>烛生 · 管理后台</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>
          请用管理员账号登录。
        </p>

        <label htmlFor="username">用户名</label>
        <input id="username" className="input" value={username} autoComplete="username"
               onChange={(e) => setUsername(e.target.value)} />

        <label htmlFor="password" style={{ display: 'block', marginTop: 12 }}>密码</label>
        <input id="password" className="input" type="password" value={password}
               autoComplete="current-password"
               onChange={(e) => setPassword(e.target.value)} />

        {error && (
          <p role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</p>
        )}

        <button type="submit" className="btn primary" disabled={submitting}
                style={{ width: '100%', marginTop: 20 }}>
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 9: 写 `admin/src/auth/RequireAuth.tsx`**

```tsx
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from './useAuth'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth()
  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>载入中…</div>
  if (!me) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 10: 更新 `admin/src/App.tsx`**

Task 10 会把 `<Shell>` 与五个模块填进来，本任务先接上登录与守卫：

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import LoginPage from './auth/LoginPage'
import RequireAuth from './auth/RequireAuth'
import { AuthProvider } from './auth/useAuth'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <div className="card">已登录。模块在 Task 10 接入。</div>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/config" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 11: 跑测试**

```bash
cd admin && npm test && npm run typecheck
```

Expected: 客户端 9 项 + 登录页 7 项全过，typecheck 无错

- [ ] **Step 12: 手工联调**

开两个终端：

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8010
```
```bash
cd admin && npm run dev
```

浏览器开 `http://localhost:5174/login`，用 Task 3 建的 `devadmin` 登录。
Expected: 登录成功后进入占位页；输错密码显示「用户名或密码不正确」；
刷新页面仍保持登录；关掉标签页再开需要重新登录。

- [ ] **Step 13: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin-ui): API 客户端、登录页与路由守卫`

---

## Task 10: 外壳、侧边导航与通用组件

**Files:**
- Create: `admin/src/layout/Shell.tsx` / `Sidebar.tsx`
- Create: `admin/src/components/Field.tsx` / `StatusTag.tsx` / `DiffTable.tsx` / `ConfirmDialog.tsx` / `Toast.tsx`
- Modify: `admin/src/App.tsx`
- Test: `admin/src/layout/__tests__/Sidebar.test.tsx`、`admin/src/components/__tests__/DiffTable.test.tsx`、`admin/src/components/__tests__/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: `useAuth`（Task 9）、`ConfigChange` / `ArtStatus`（Task 9 的 types.ts）
- Produces:
  - `Shell` —— 侧栏 + 内容区，`<Outlet />` 渲染子路由
  - `Sidebar` —— 5 项导航，当前项高亮，底部显示登录名与登出
  - `Field({label, htmlFor, error, hint, children})`
  - `StatusTag({status})` —— 上架绿 / 下架黄 / 撤回红
  - `DiffTable({changes})` —— 变动项表格，无变动时显示「没有改动」
  - `ConfirmDialog({open, title, body, confirmLabel, danger, onConfirm, onCancel})`
  - `useToast()` / `ToastHost` —— 保存成功的短提示

- [ ] **Step 1: 写失败测试**

新建 `admin/src/layout/__tests__/Sidebar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import Sidebar from '../Sidebar'

const renderAt = (path: string, signOut = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar username="alice" onSignOut={signOut} />
    </MemoryRouter>,
  )

describe('侧边导航', () => {
  it('渲染五个模块', () => {
    renderAt('/config')
    for (const name of ['基础设置', '开场引导', '仪式设置', '记录与奖励', '作品库']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('当前路由的那一项被标记为 current', () => {
    renderAt('/art')
    expect(screen.getByRole('link', { name: '作品库' }))
      .toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '基础设置' }))
      .not.toHaveAttribute('aria-current')
  })

  it('显示当前登录的管理员', () => {
    renderAt('/config')
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('点登出触发回调', async () => {
    const signOut = vi.fn()
    renderAt('/config', signOut)
    await userEvent.click(screen.getByRole('button', { name: '登出' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('没有任何指向用户数据的入口', () => {
    renderAt('/config')
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '')
    for (const href of links) {
      expect(href).not.toMatch(/user|night|record|journal/i)
    }
  })
})
```

> 最后一条不是形式主义：隐私约束在后端由 AST 测试把守，前端这一条保证
> 界面上也没有通往用户数据的门。

新建 `admin/src/components/__tests__/DiffTable.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DiffTable from '../DiffTable'

describe('变动预览表', () => {
  it('列出每一项变动的路径、原值与新值', () => {
    render(
      <DiffTable
        changes={[
          { path: 'ritual.tolerance_minutes', from: 30, to: 15 },
          { path: 'app.slogan', from: '陪你按时睡觉', to: '陪你好好睡' },
        ]}
      />,
    )
    expect(screen.getByText('按时完成容差（分钟）')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('陪你按时睡觉')).toBeInTheDocument()
  })

  it('无变动时明说没有改动', () => {
    render(<DiffTable changes={[]} />)
    expect(screen.getByText('没有改动')).toBeInTheDocument()
  })

  it('数组值渲染成可读的逗号串而不是 [object Object]', () => {
    render(
      <DiffTable
        changes={[{ path: 'ritual.resistance_options', from: ['a', 'b'], to: ['a'] }]}
      />,
    )
    expect(screen.getByText('a、b')).toBeInTheDocument()
    expect(screen.queryByText(/object Object/)).toBeNull()
  })

  it('布尔值渲染成开/关', () => {
    render(
      <DiffTable changes={[{ path: 'app.skip_tonight_enabled', from: true, to: false }]} />,
    )
    expect(screen.getByText('开')).toBeInTheDocument()
    expect(screen.getByText('关')).toBeInTheDocument()
  })

  it('不认识的路径退回显示原始路径，不崩', () => {
    render(<DiffTable changes={[{ path: 'x.y', from: 1, to: 2 }]} />)
    expect(screen.getByText('x.y')).toBeInTheDocument()
  })

  it('容差被改动时给出额外警告——这一项会立刻影响用户的按时判定', () => {
    render(
      <DiffTable changes={[{ path: 'ritual.tolerance_minutes', from: 30, to: 3 }]} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('历史夜记不会被修正')
  })
})
```

新建 `admin/src/components/__tests__/ConfirmDialog.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '../ConfirmDialog'

const props = {
  open: true,
  title: '确认撤回',
  body: '撤回后，已收藏这幅作品的用户也将看不到它。',
  confirmLabel: '撤回',
  danger: true,
}

describe('确认对话框', () => {
  it('open 为 false 时不渲染', () => {
    render(<ConfirmDialog {...props} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('渲染标题与说明', () => {
    render(<ConfirmDialog {...props} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('确认撤回')
    expect(screen.getByText(/已收藏这幅作品的用户也将看不到/)).toBeInTheDocument()
  })

  it('确认与取消各自触发回调', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: '撤回' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('按 Esc 取消', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...props} onConfirm={vi.fn()} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd admin && npm test
```

Expected: FAIL —— 找不到 `../Sidebar` / `../DiffTable` / `../ConfirmDialog`

- [ ] **Step 3: 写 `admin/src/components/Field.tsx`**

```tsx
import type { ReactNode } from 'react'

export default function Field({
  label, htmlFor, error, hint, children, full,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
  full?: boolean
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, marginBottom: 4 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
      {!error && hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 4: 写 `admin/src/components/StatusTag.tsx`**

```tsx
import type { ArtStatus } from '../api/types'

const STYLES: Record<ArtStatus, { label: string; color: string; bg: string }> = {
  active: { label: '上架中', color: 'var(--success)', bg: 'var(--success-bg)' },
  inactive: { label: '已下架', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  withdrawn: { label: '已撤回', color: 'var(--danger)', bg: 'var(--soft)' },
}

export default function StatusTag({ status }: { status: ArtStatus }) {
  const s = STYLES[status]
  return (
    <span style={{
      color: s.color, background: s.bg, borderRadius: 999,
      padding: '2px 10px', fontSize: 12, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
```

- [ ] **Step 5: 写 `admin/src/components/DiffTable.tsx`**

```tsx
import type { ConfigChange } from '../api/types'

/**
 * 配置字段路径 → 中文标签。
 *
 * 单行覆盖不可回滚，用户已知情并选择了这个方案。这张表是那个决策的主要防线：
 * 42 个字段的表单，最大的风险不是不能回滚，而是改了自己没意识到改了什么。
 * 所以 diff 必须用管理员在表单上看到的那个中文标签，不能直接甩出英文路径。
 */
const LABELS: Record<string, string> = {
  'app.name': '小程序名称',
  'app.slogan': '一句话定位',
  'app.home_question': '首页核心问题',
  'app.skip_tonight_enabled': '允许跳过今晚',
  'app.onboarding_enabled': '首次使用显示引导',
  'app.reduce_motion_default': '减少动态效果选项',
  'app.anonymous_analytics_enabled': '允许匿名事件统计',
  'schedule.bedtime': '默认就寝时间',
  'schedule.wake_time': '默认起床时间',
  'schedule.min_time': '可选最早就寝时间',
  'schedule.max_time': '可选最晚就寝时间',
  'onboarding.welcome_title': '欢迎页标题',
  'onboarding.guest_copy': '游客说明',
  'onboarding.guide_rest': '第一幕',
  'onboarding.guide_light': '第二幕',
  'onboarding.guide_gift': '第三幕',
  'onboarding.story_video_path': '视频资源路径',
  'onboarding.story_poster': '封面资源',
  'onboarding.story_status': '播放提示',
  'onboarding.skip_story_enabled': '允许跳过序章',
  'ritual.tolerance_minutes': '按时完成容差（分钟）',
  'ritual.gratitude_count': '感恩输入数量',
  'ritual.plan_count': '明日计划数量',
  'ritual.resistance_options': '晚间阻力选项',
  'ritual.ritual_minutes': '默认仪式时长（分钟）',
  'ritual.dim_minutes': '提前变暗（分钟）',
  'ritual.goodnight_text': '完成文案',
  'ritual.interrupt_text': '中断后的温柔提醒',
  'ritual.resistance_reply': '默认温柔回应',
  'ritual.stage_not_started_enabled': '阶段一 · 未开始',
  'ritual.stage_wind_down_enabled': '阶段二 · 准备入睡',
  'ritual.stage_quieting_enabled': '阶段三 · 即将入睡',
  'ritual.stage_done_enabled': '阶段四 · 已完成',
  'records.journal_days': '默认展示最近天数',
  'records.journal_empty_copy': '夜记空状态',
  'records.comparison_copy': '比较反馈模板',
  'records.collection_limit': '收藏总数量',
  'records.reward_timing': '奖励出现时间',
  'records.reward_copy': '次日奖励文案',
  'records.collection_empty_copy': '收藏空状态',
  'records.random_art_enabled': '名画随机解锁',
  'records.image_fallback_enabled': '图片加载失败显示统一占位',
}

// 这些字段改了会立刻改变用户可见的判定结果，值得单独警告一句
const HIGH_IMPACT = new Set([
  'ritual.tolerance_minutes',
  'schedule.min_time',
  'schedule.max_time',
])

function show(value: unknown): string {
  if (value === null || value === undefined) return '（空）'
  if (typeof value === 'boolean') return value ? '开' : '关'
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}

export default function DiffTable({ changes }: { changes: ConfigChange[] }) {
  if (changes.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>没有改动</p>
  }

  const risky = changes.filter((c) => HIGH_IMPACT.has(c.path))

  return (
    <div>
      {risky.length > 0 && (
        <p role="alert" style={{
          background: 'var(--warn-bg)', color: 'var(--warn)',
          padding: '10px 14px', borderRadius: 10, marginTop: 0,
        }}>
          这次改动会影响按时判定。今晚起生效，
          <strong>历史夜记不会被修正</strong>——已经写进去的资格与迟到分钟是固化的。
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
            <th style={{ padding: '8px 0' }}>字段</th>
            <th>现在</th>
            <th>改成</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.path} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 0' }}>{LABELS[c.path] ?? c.path}</td>
              <td style={{ color: 'var(--muted)' }}>{show(c.from)}</td>
              <td style={{ color: 'var(--primary-deep)' }}>{show(c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { LABELS as FIELD_LABELS }
```

- [ ] **Step 6: 写 `admin/src/components/ConfirmDialog.tsx`**

```tsx
import { useEffect } from 'react'
import type { ReactNode } from 'react'

export default function ConfirmDialog({
  open, title, body, confirmLabel, danger, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(23,20,29,.45)',
        display: 'grid', placeItems: 'center', zIndex: 'var(--z-overlay)' as never,
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card"
        style={{ width: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{title}</h2>
        <div style={{ color: 'var(--muted)', marginBottom: 20 }}>{body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>取消</button>
          <button type="button" className={danger ? 'btn danger' : 'btn primary'}
                  onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 写 `admin/src/components/Toast.tsx`**

```tsx
import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

const ToastContext = createContext<(msg: string) => void>(() => {})

export function ToastHost({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const show = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 2600)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--ink)', color: '#fff', padding: '10px 20px',
            borderRadius: 999, zIndex: 'var(--z-toast)' as never,
          }}
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
```

- [ ] **Step 8: 写 `admin/src/layout/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'

export const NAV = [
  { to: '/config', label: '基础设置' },
  { to: '/onboarding', label: '开场引导' },
  { to: '/ritual', label: '仪式设置' },
  { to: '/records', label: '记录与奖励' },
  { to: '/art', label: '作品库' },
] as const

export default function Sidebar({
  username, onSignOut,
}: { username: string; onSignOut: () => void }) {
  return (
    <nav style={{
      width: 'var(--sidebar)', minHeight: '100vh', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', padding: '24px 16px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 24, paddingLeft: 8 }}>
        烛生 · 后台
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              style={({ isActive }) => ({
                display: 'block', padding: '10px 12px', borderRadius: 10,
                textDecoration: 'none', marginBottom: 4,
                background: isActive ? 'var(--primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary-deep)' : 'var(--ink)',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>已登录</div>
        <div style={{ marginBottom: 8 }}>{username}</div>
        <button type="button" className="btn" onClick={onSignOut}
                style={{ width: '100%' }}>
          登出
        </button>
      </div>
    </nav>
  )
}
```

`NavLink` 在匹配时会自动加 `aria-current="page"`，测试的第二条依赖这个默认行为。

- [ ] **Step 9: 写 `admin/src/layout/Shell.tsx`**

```tsx
import { Outlet } from 'react-router-dom'

import { ToastHost } from '../components/Toast'
import { useAuth } from '../auth/useAuth'
import Sidebar from './Sidebar'

export default function Shell() {
  const { me, signOut } = useAuth()
  return (
    <ToastHost>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar username={me?.username ?? ''} onSignOut={signOut} />
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>
          <Outlet />
        </main>
      </div>
    </ToastHost>
  )
}
```

- [ ] **Step 10: 更新 `admin/src/App.tsx` 接上路由骨架**

模块页面在 Task 11 / 12 建，这里先各放一个最小占位组件，保证路由可跑通：

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import LoginPage from './auth/LoginPage'
import RequireAuth from './auth/RequireAuth'
import { AuthProvider } from './auth/useAuth'
import Shell from './layout/Shell'

const Placeholder = ({ name }: { name: string }) => (
  <div className="card">{name} —— 待实现</div>
)

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route path="/config" element={<Placeholder name="基础设置" />} />
            <Route path="/onboarding" element={<Placeholder name="开场引导" />} />
            <Route path="/ritual" element={<Placeholder name="仪式设置" />} />
            <Route path="/records" element={<Placeholder name="记录与奖励" />} />
            <Route path="/art" element={<Placeholder name="作品库" />} />
          </Route>
          <Route path="*" element={<Navigate to="/config" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 11: 跑测试**

```bash
cd admin && npm test && npm run typecheck && npm run build
```

Expected: Sidebar 5 项 + DiffTable 6 项 + ConfirmDialog 4 项全过

- [ ] **Step 12: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin-ui): 外壳、侧边导航与通用组件`

---

## Task 11: 四个配置模块与保存前 diff 预览

四个模块共用一套「加载 → 编辑 → 预览 → 确认 → 保存」的流程，抽成一个
`useConfigForm` hook，四个页面只声明各自渲染哪些字段。

**Files:**
- Create: `admin/src/modules/config/useConfigForm.ts`
- Create: `admin/src/modules/config/ConfigFormShell.tsx`
- Create: `admin/src/modules/config/BasicPage.tsx` / `OnboardingPage.tsx` / `RitualPage.tsx` / `RecordsPage.tsx`
- Modify: `admin/src/App.tsx`
- Test: `admin/src/modules/config/__tests__/useConfigForm.test.tsx`、`admin/src/modules/config/__tests__/BasicPage.test.tsx`、`admin/src/modules/config/__tests__/RitualPage.test.tsx`

**Interfaces:**
- Consumes: `fetchConfig` / `previewConfig` / `saveConfig` / `exportConfigUrl`（Task 9）、`DiffTable` / `Field` / `ConfirmDialog` / `useToast`（Task 10）
- Produces:
  - `useConfigForm()` → `{ config, setField, loading, error, fieldErrors, dirty, preview, diff, saving, save, reset, exportSnapshot, updatedBy, updatedAt }`
  - `setField<G extends ConfigGroup, K extends keyof AdminConfig[G]>(group, key, value)` —— 类型安全
  - `ConfigFormShell({title, description, onExport, children})`

### 保存流程（四个模块一致）

1. 管理员改字段 → `dirty` 变 true
2. 点「保存」→ 先打 `PUT ?dry_run=true`
3. 校验不过 → 逐字段红字，不弹窗
4. 校验通过 → 弹 `ConfirmDialog`，里面是 `DiffTable`
5. 确认 → 打真实 `PUT` → toast「已保存」→ 重新拉取

**四个页面共用同一份完整配置对象。** 后端的 `PUT /config` 要求全量提交
（`AdminConfigPayload` 是 `extra="forbid"` 的完整模型），所以每个页面都持有全部
5 组，只是渲染其中一部分。这样在「基础设置」页保存不会把「仪式设置」页的值清掉。

- [ ] **Step 1: 写失败测试（hook）**

新建 `admin/src/modules/config/__tests__/useConfigForm.test.tsx`：

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../api/client'
import * as endpoints from '../../../api/endpoints'
import type { AdminConfig } from '../../../api/types'
import { useConfigForm } from '../useConfigForm'

const CONFIG: AdminConfig = {
  app: {
    name: '烛生', slogan: '陪你按时睡觉', home_question: '今晚，几点睡？',
    skip_tonight_enabled: true, onboarding_enabled: true,
    reduce_motion_default: true, anonymous_analytics_enabled: false,
  },
  schedule: { bedtime: '23:30', wake_time: '07:30', min_time: '20:00', max_time: '02:00' },
  onboarding: {
    welcome_title: '让今晚，轻一点。', guest_copy: '无需登录，记录仅保存在这台设备。',
    guide_rest: '把今天放在门外', guide_light: '为自己留一盏小灯',
    guide_gift: '明早，收下一份安静的礼物',
    story_video_path: 'story/zhusheng-prologue.mp4',
    story_poster: 'story/01-enter-bedroom.png',
    story_status: '让这段故事，带你慢慢安静下来。', skip_story_enabled: true,
  },
  ritual: {
    tolerance_minutes: 30, gratitude_count: 3, plan_count: 3,
    resistance_options: ['我还在刷手机'], ritual_minutes: 30, dim_minutes: 10,
    goodnight_text: '今天已经好好结束了。晚安。',
    interrupt_text: '不用责怪自己。', resistance_reply: '把手机放远一点。',
    stage_not_started_enabled: true, stage_wind_down_enabled: true,
    stage_quieting_enabled: true, stage_done_enabled: true,
  },
  records: {
    journal_days: 30, journal_empty_copy: '空', comparison_copy: '早了 {minutes} 分钟。',
    collection_limit: 100, reward_timing: 'next-day', reward_copy: '礼物',
    collection_empty_copy: '空', random_art_enabled: true, image_fallback_enabled: true,
  },
}

const clone = () => JSON.parse(JSON.stringify(CONFIG)) as AdminConfig

describe('useConfigForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchConfig').mockResolvedValue({
      config: clone(), updated_by: 'alice', updated_at: '2026-08-31T10:00:00Z',
    })
  })

  it('加载后填入配置与最后修改人', async () => {
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.config?.app.name).toBe('烛生')
    expect(result.current.updatedBy).toBe('alice')
  })

  it('改字段后 dirty 变 true', async () => {
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dirty).toBe(false)
    act(() => result.current.setField('app', 'slogan', '陪你好好睡'))
    expect(result.current.dirty).toBe(true)
    expect(result.current.config?.app.slogan).toBe('陪你好好睡')
  })

  it('preview 提交完整的五组配置，不是只提交当前页那一组', async () => {
    const spy = vi.spyOn(endpoints, 'previewConfig')
      .mockResolvedValue({ changes: [], valid: true, errors: [] })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', 'x'))
    await act(async () => { await result.current.preview() })
    const sent = spy.mock.calls[0]![0]
    expect(Object.keys(sent).sort()).toEqual(
      ['app', 'onboarding', 'records', 'ritual', 'schedule'])
  })

  it('校验不过时把错误按字段路径摊平，不弹窗', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [], valid: false,
      errors: [{ field: 'ritual.tolerance_minutes', message: '不得大于 180' }],
    })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.preview() })
    expect(result.current.fieldErrors['ritual.tolerance_minutes']).toBe('不得大于 180')
    expect(result.current.diff).toBeNull()
  })

  it('校验通过时把 diff 留给调用方渲染', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: '陪你按时睡觉', to: 'x' }],
      valid: true, errors: [],
    })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.preview() })
    expect(result.current.diff?.changes).toHaveLength(1)
    expect(result.current.fieldErrors).toEqual({})
  })

  it('save 成功后清掉 dirty 与 diff', async () => {
    vi.spyOn(endpoints, 'saveConfig').mockResolvedValue({
      config: clone(), updated_by: 'alice', updated_at: '2026-08-31T11:00:00Z',
    })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', 'x'))
    await act(async () => { await result.current.save() })
    expect(result.current.dirty).toBe(false)
    expect(result.current.diff).toBeNull()
    expect(result.current.updatedAt).toBe('2026-08-31T11:00:00Z')
  })

  it('save 失败时保留用户的编辑，不把表单清空', async () => {
    vi.spyOn(endpoints, 'saveConfig')
      .mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', '服务器内部错误'))
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', '别弄丢我'))
    await act(async () => { await result.current.save().catch(() => {}) })
    expect(result.current.config?.app.slogan).toBe('别弄丢我')
    expect(result.current.dirty).toBe(true)
    expect(result.current.error).toContain('服务器内部错误')
  })

  it('reset 把表单退回上次保存的状态', async () => {
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', 'x'))
    act(() => result.current.reset())
    expect(result.current.config?.app.slogan).toBe('陪你按时睡觉')
    expect(result.current.dirty).toBe(false)
  })

  it('加载失败时给出可读错误，不留空白页', async () => {
    vi.spyOn(endpoints, 'fetchConfig')
      .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行'))
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('网络连接失败')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd admin && npm test -- useConfigForm
```

Expected: FAIL —— 找不到 `../useConfigForm`

- [ ] **Step 3: 写 `admin/src/modules/config/useConfigForm.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '../../api/client'
import { fetchConfig, previewConfig, saveConfig } from '../../api/endpoints'
import type { AdminConfig, ConfigDiff, ConfigGroup } from '../../api/types'

const clone = (c: AdminConfig): AdminConfig => JSON.parse(JSON.stringify(c))

export function useConfigForm() {
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [diff, setDiff] = useState<ConfigDiff | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // 上次保存的快照，reset 用它回退
  const saved = useRef<AdminConfig | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchConfig()
      saved.current = clone(res.config)
      setConfig(clone(res.config))
      setUpdatedBy(res.updated_by)
      setUpdatedAt(res.updated_at)
      setDirty(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const setField = useCallback(
    <G extends ConfigGroup, K extends keyof AdminConfig[G]>(
      group: G, key: K, value: AdminConfig[G][K],
    ) => {
      setConfig((prev) => (prev ? { ...prev, [group]: { ...prev[group], [key]: value } } : prev))
      setDirty(true)
      // 用户开始改这个字段，就把它上次的错误消掉
      setFieldErrors((prev) => {
        const path = `${group}.${String(key)}`
        if (!(path in prev)) return prev
        const next = { ...prev }
        delete next[path]
        return next
      })
    },
    [],
  )

  const preview = useCallback(async () => {
    if (!config) return
    setError(null)
    try {
      const res = await previewConfig(config)
      if (res.valid) {
        setFieldErrors({})
        setDiff(res)
      } else {
        // 校验不过就不弹确认窗，把错误摊到字段旁边
        setDiff(null)
        setFieldErrors(Object.fromEntries(res.errors.map((e) => [e.field, e.message])))
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    }
  }, [config])

  const save = useCallback(async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const res = await saveConfig(config)
      saved.current = clone(res.config)
      setConfig(clone(res.config))
      setUpdatedBy(res.updated_by)
      setUpdatedAt(res.updated_at)
      setDirty(false)
      setDiff(null)
      setFieldErrors({})
    } catch (e) {
      // 刻意不清空 config：保存失败时把用户刚打的字弄丢是最惹人烦的一种 bug
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
      throw e
    } finally {
      setSaving(false)
    }
  }, [config])

  const reset = useCallback(() => {
    if (saved.current) setConfig(clone(saved.current))
    setDirty(false)
    setDiff(null)
    setFieldErrors({})
  }, [])

  const dismissDiff = useCallback(() => setDiff(null), [])

  return {
    config, loading, saving, error, fieldErrors, diff, dirty,
    updatedBy, updatedAt,
    setField, preview, save, reset, reload: load, dismissDiff,
  }
}
```

- [ ] **Step 4: 写 `admin/src/modules/config/ConfigFormShell.tsx`**

```tsx
import type { ReactNode } from 'react'

import ConfirmDialog from '../../components/ConfirmDialog'
import DiffTable from '../../components/DiffTable'
import { useToast } from '../../components/Toast'
import { exportConfigUrl } from '../../api/endpoints'
import { getToken } from '../../api/client'
import type { useConfigForm } from './useConfigForm'

type Form = ReturnType<typeof useConfigForm>

/** 导出快照。
 *
 * 不能用 <a href> 直接下载：那个请求需要 Authorization 头，链接带不了。
 * 所以 fetch 拿到内容再造 Blob。
 */
async function downloadSnapshot(): Promise<void> {
  const res = await fetch(exportConfigUrl, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  })
  if (!res.ok) throw new Error('导出失败')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zhusheng-config-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ConfigFormShell({
  title, description, form, children,
}: {
  title: string
  description: string
  form: Form
  children: ReactNode
}) {
  const toast = useToast()

  if (form.loading) return <div className="card">载入中…</div>
  if (!form.config) {
    return (
      <div className="card">
        <p role="alert" className="field-error">{form.error ?? '配置读取失败'}</p>
        <button type="button" className="btn" onClick={() => void form.reload()}>重试</button>
      </div>
    )
  }

  return (
    <>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>{title}</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>{description}</p>
        {form.updatedBy && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            最后修改：{form.updatedBy}
            {form.updatedAt && ` · ${new Date(form.updatedAt).toLocaleString('zh-CN')}`}
          </p>
        )}
      </header>

      <form
        className="card"
        onSubmit={(e) => { e.preventDefault(); void form.preview() }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
          {children}
        </div>

        {form.error && (
          <p role="alert" className="field-error" style={{ marginTop: 16 }}>{form.error}</p>
        )}

        <div style={{
          display: 'flex', gap: 10, marginTop: 24, paddingTop: 18,
          borderTop: '1px solid var(--border)',
        }}>
          <button type="submit" className="btn primary" disabled={!form.dirty || form.saving}>
            保存
          </button>
          <button type="button" className="btn" disabled={!form.dirty} onClick={form.reset}>
            撤销改动
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              void downloadSnapshot()
                .then(() => toast('已导出当前配置'))
                .catch(() => toast('导出失败'))
            }}
          >
            导出快照
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          配置保存后立即生效，且<strong>不保留历史版本</strong>。
          改动前建议先导出一份快照。
        </p>
      </form>

      <ConfirmDialog
        open={form.diff !== null}
        title="确认这些改动"
        body={<DiffTable changes={form.diff?.changes ?? []} />}
        confirmLabel={form.saving ? '保存中…' : '确认保存'}
        onCancel={form.dismissDiff}
        onConfirm={() => {
          void form.save().then(() => toast('已保存')).catch(() => {})
        }}
      />
    </>
  )
}
```

- [ ] **Step 5: 写四个页面**

`admin/src/modules/config/BasicPage.tsx`：

```tsx
import Field from '../../components/Field'
import ConfigFormShell from './ConfigFormShell'
import { useConfigForm } from './useConfigForm'

export default function BasicPage() {
  const form = useConfigForm()
  const c = form.config

  return (
    <ConfigFormShell
      title="基础设置"
      description="小程序的名称、定位与默认作息时间。"
      form={form}
    >
      {c && (
        <>
          <Field label="小程序名称" htmlFor="app-name" error={form.fieldErrors['app.name']}>
            <input id="app-name" className="input" value={c.app.name}
                   aria-invalid={Boolean(form.fieldErrors['app.name'])}
                   onChange={(e) => form.setField('app', 'name', e.target.value)} />
          </Field>

          <Field label="一句话定位" htmlFor="app-slogan"
                 error={form.fieldErrors['app.slogan']}>
            <input id="app-slogan" className="input" value={c.app.slogan}
                   aria-invalid={Boolean(form.fieldErrors['app.slogan'])}
                   onChange={(e) => form.setField('app', 'slogan', e.target.value)} />
          </Field>

          <Field label="首页核心问题" htmlFor="app-question" full
                 error={form.fieldErrors['app.home_question']}>
            <input id="app-question" className="input" value={c.app.home_question}
                   aria-invalid={Boolean(form.fieldErrors['app.home_question'])}
                   onChange={(e) => form.setField('app', 'home_question', e.target.value)} />
          </Field>

          <Field label="默认就寝时间" htmlFor="bedtime"
                 error={form.fieldErrors['schedule.bedtime']}>
            <input id="bedtime" className="input" type="time" value={c.schedule.bedtime}
                   onChange={(e) => form.setField('schedule', 'bedtime', e.target.value)} />
          </Field>

          <Field label="默认起床时间" htmlFor="wake-time"
                 error={form.fieldErrors['schedule.wake_time']}>
            <input id="wake-time" className="input" type="time" value={c.schedule.wake_time}
                   onChange={(e) => form.setField('schedule', 'wake_time', e.target.value)} />
          </Field>

          <Field label="可选最早就寝时间" htmlFor="min-time"
                 hint="资格窗口的下界，早于这个时间熄灯不计为按时"
                 error={form.fieldErrors['schedule.min_time']}>
            <input id="min-time" className="input" type="time" value={c.schedule.min_time}
                   onChange={(e) => form.setField('schedule', 'min_time', e.target.value)} />
          </Field>

          <Field label="可选最晚就寝时间" htmlFor="max-time"
                 hint="资格窗口的上界，可跨午夜。不得与下界相同"
                 error={form.fieldErrors['schedule.max_time']}>
            <input id="max-time" className="input" type="time" value={c.schedule.max_time}
                   onChange={(e) => form.setField('schedule', 'max_time', e.target.value)} />
          </Field>

          <Field label="允许跳过今晚" htmlFor="skip-tonight" full
                 hint="用户可结束当晚仪式，不影响历史记录">
            <input id="skip-tonight" type="checkbox" checked={c.app.skip_tonight_enabled}
                   onChange={(e) =>
                     form.setField('app', 'skip_tonight_enabled', e.target.checked)} />
          </Field>

          <Field label="首次使用显示引导" htmlFor="onboarding-enabled" full
                 hint="注册授权后播放保留的视觉序章">
            <input id="onboarding-enabled" type="checkbox" checked={c.app.onboarding_enabled}
                   onChange={(e) =>
                     form.setField('app', 'onboarding_enabled', e.target.checked)} />
          </Field>

          <Field label="减少动态效果选项" htmlFor="reduce-motion" full
                 hint="为敏感用户提供静态版仪式">
            <input id="reduce-motion" type="checkbox" checked={c.app.reduce_motion_default}
                   onChange={(e) =>
                     form.setField('app', 'reduce_motion_default', e.target.checked)} />
          </Field>

          <Field label="允许匿名事件统计" htmlFor="anon-analytics" full
                 hint="仅在用户同意后记录不含正文的功能事件">
            <input id="anon-analytics" type="checkbox"
                   checked={c.app.anonymous_analytics_enabled}
                   onChange={(e) =>
                     form.setField('app', 'anonymous_analytics_enabled', e.target.checked)} />
          </Field>
        </>
      )}
    </ConfigFormShell>
  )
}
```

`OnboardingPage.tsx`、`RitualPage.tsx`、`RecordsPage.tsx` **同样的结构**，各自渲染对应的字段。逐字段清单：

**OnboardingPage**（title「开场引导」，description「首次进入时的欢迎与序章。」）：
`onboarding.welcome_title`「欢迎页标题」、`guest_copy`「游客说明」、
`guide_rest`「第一幕」、`guide_light`「第二幕」、`guide_gift`「第三幕」、
`story_video_path`「视频资源路径」（hint「相对 ASSET_BASE_URL 的路径」）、
`story_poster`「封面资源」、`story_status`「播放提示」、
`skip_story_enabled`「允许跳过序章」（checkbox，hint「播放失败或减少动态效果时可以直接继续」）。

**RitualPage**（title「仪式设置」，description「仪式的四个阶段、时长与文案。」）：
`ritual.ritual_minutes`「默认仪式时长（分钟）」（number，min 1 max 180）、
`dim_minutes`「提前变暗（分钟）」（number，min 0 max 60）、
`gratitude_count`「感恩输入数量」（number，min 1 max 5）、
`plan_count`「明日计划数量」（number，min 1 max 5）、
`resistance_options`「晚间阻力选项」（textarea，**一行一项**，
`value={c.ritual.resistance_options.join('\n')}`，
`onChange` 时 `e.target.value.split('\n').filter((s) => s.trim())`，
hint「一行一项，最多 8 项，每项不超过 32 字」）、
`resistance_reply`「默认温柔回应」、`goodnight_text`「完成文案」、
`interrupt_text`「中断后的温柔提醒」（textarea）、
四个 `stage_*_enabled` 复选框「阶段一 · 未开始」「阶段二 · 准备入睡」
「阶段三 · 即将入睡」「阶段四 · 已完成」。

**RitualPage 还要渲染一行只读说明**（不是开关，见本计划开头的说明）：

```tsx
<div style={{ gridColumn: '1 / -1', background: 'var(--soft)',
              borderRadius: 10, padding: '12px 16px' }}>
  <strong>书写内容仅保存在用户端与加密列中</strong>
  <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
    感恩与明日计划的正文以 MultiFernet 加密存储，管理后台没有任何接口可以读取或
    解密它们。这是架构保证，不是可配置项。
  </p>
</div>
```

**RecordsPage**（title「记录与奖励」，description「夜记展示、按时容差与收藏奖励。」）：
`records.journal_days`「默认展示最近天数」（number，min 1 max 365）、
**`ritual.tolerance_minutes`「按时完成容差（分钟）」**（number，min 0 max 180，
hint「改动只影响此后的仪式夜，已写入的历史夜记不会被修正」；
注意这个字段属于 `ritual` 组，`setField('ritual', 'tolerance_minutes', …)`）、
`records.journal_empty_copy`「夜记空状态」、`comparison_copy`「比较反馈模板」
（hint「`{minutes}` 会被替换成实际分钟数」）、
`collection_limit`「收藏总数量」（number，min 1 max 500）、
`reward_timing`「奖励出现时间」（select，两个选项：`next-day`「次日首次打开」、
`immediate`「仪式完成后」）、`reward_copy`「次日奖励文案」、
`collection_empty_copy`「收藏空状态」、
`random_art_enabled`「名画随机解锁」、`image_fallback_enabled`「图片加载失败显示统一占位」。

数字输入统一用 `onChange={(e) => form.setField(g, k, Number(e.target.value))}`，
**不要**传字符串——后端的 `AdminConfigPayload` 要求 int，传字符串会 422。

- [ ] **Step 6: 写页面测试**

新建 `admin/src/modules/config/__tests__/BasicPage.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../../api/endpoints'
import { ToastHost } from '../../../components/Toast'
import BasicPage from '../BasicPage'
import { CONFIG_FIXTURE } from './fixture'

const renderPage = () => render(<ToastHost><BasicPage /></ToastHost>)

describe('基础设置页', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchConfig').mockResolvedValue({
      config: JSON.parse(JSON.stringify(CONFIG_FIXTURE)),
      updated_by: 'alice', updated_at: '2026-08-31T10:00:00Z',
    })
  })

  it('把当前值填进输入框', async () => {
    renderPage()
    expect(await screen.findByLabelText('小程序名称')).toHaveValue('烛生')
    expect(screen.getByLabelText('一句话定位')).toHaveValue('陪你按时睡觉')
    expect(screen.getByLabelText('默认就寝时间')).toHaveValue('23:30')
  })

  it('显示最后修改人', async () => {
    renderPage()
    expect(await screen.findByText(/alice/)).toBeInTheDocument()
  })

  it('未改动时保存按钮不可点', async () => {
    renderPage()
    await screen.findByLabelText('小程序名称')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('改动后先走 dry_run，再弹确认窗展示 diff', async () => {
    const preview = vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: '陪你按时睡觉', to: '陪你好好睡' }],
      valid: true, errors: [],
    })
    renderPage()
    const slogan = await screen.findByLabelText('一句话定位')
    await userEvent.clear(slogan)
    await userEvent.type(slogan, '陪你好好睡')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(preview).toHaveBeenCalled())
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('一句话定位')).toBeInTheDocument()
    expect(screen.getByText('陪你好好睡')).toBeInTheDocument()
  })

  it('确认后才真正保存', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: 'a', to: 'b' }], valid: true, errors: [],
    })
    const save = vi.spyOn(endpoints, 'saveConfig').mockResolvedValue({
      config: JSON.parse(JSON.stringify(CONFIG_FIXTURE)),
      updated_by: 'alice', updated_at: '2026-08-31T11:00:00Z',
    })
    renderPage()
    await userEvent.type(await screen.findByLabelText('一句话定位'), 'x')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('dialog')
    expect(save).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '确认保存' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(await screen.findByRole('status')).toHaveTextContent('已保存')
  })

  it('取消确认窗则不保存', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: 'a', to: 'b' }], valid: true, errors: [],
    })
    const save = vi.spyOn(endpoints, 'saveConfig')
    renderPage()
    await userEvent.type(await screen.findByLabelText('一句话定位'), 'x')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(save).not.toHaveBeenCalled()
  })

  it('校验不过时在字段旁标红，不弹确认窗', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [], valid: false,
      errors: [{ field: 'app.name', message: '不得为空' }],
    })
    renderPage()
    const name = await screen.findByLabelText('小程序名称')
    await userEvent.clear(name)
    await userEvent.type(name, 'x')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('不得为空')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(name).toHaveAttribute('aria-invalid', 'true')
  })

  it('撤销改动退回原值', async () => {
    renderPage()
    const slogan = await screen.findByLabelText('一句话定位')
    await userEvent.clear(slogan)
    await userEvent.type(slogan, '改坏了')
    await userEvent.click(screen.getByRole('button', { name: '撤销改动' }))
    expect(slogan).toHaveValue('陪你按时睡觉')
  })

  it('加载失败时显示错误与重试按钮', async () => {
    const { ApiError } = await import('../../../api/client')
    vi.spyOn(endpoints, 'fetchConfig')
      .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接失败')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
```

新建 `admin/src/modules/config/__tests__/fixture.ts`，导出 `CONFIG_FIXTURE`
—— 内容就是 Step 1 测试里那份 `CONFIG` 常量。把它抽出来，
`useConfigForm.test.tsx` 也改成从这里 import，避免两份复制。

新建 `admin/src/modules/config/__tests__/RitualPage.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../../api/endpoints'
import { ToastHost } from '../../../components/Toast'
import RitualPage from '../RitualPage'
import { CONFIG_FIXTURE } from './fixture'

describe('仪式设置页', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchConfig').mockResolvedValue({
      config: JSON.parse(JSON.stringify(CONFIG_FIXTURE)),
      updated_by: null, updated_at: null,
    })
  })

  it('阻力选项一行一项地展示', async () => {
    render(<ToastHost><RitualPage /></ToastHost>)
    const box = await screen.findByLabelText('晚间阻力选项')
    expect(box).toHaveValue('我还在刷手机')
  })

  it('编辑阻力选项时按换行拆成数组提交', async () => {
    const preview = vi.spyOn(endpoints, 'previewConfig')
      .mockResolvedValue({ changes: [], valid: true, errors: [] })
    render(<ToastHost><RitualPage /></ToastHost>)
    const box = await screen.findByLabelText('晚间阻力选项')
    await userEvent.clear(box)
    await userEvent.type(box, '我还在刷手机{enter}我还在工作')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    const sent = preview.mock.calls[0]![0]
    expect(sent.ritual.resistance_options).toEqual(['我还在刷手机', '我还在工作'])
  })

  it('数字字段提交为数字而不是字符串', async () => {
    const preview = vi.spyOn(endpoints, 'previewConfig')
      .mockResolvedValue({ changes: [], valid: true, errors: [] })
    render(<ToastHost><RitualPage /></ToastHost>)
    const box = await screen.findByLabelText('感恩输入数量')
    await userEvent.clear(box)
    await userEvent.type(box, '4')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(preview.mock.calls[0]![0].ritual.gratitude_count).toBe(4)
  })

  it('把正文加密渲染成只读说明，不是可关的开关', async () => {
    render(<ToastHost><RitualPage /></ToastHost>)
    expect(await screen.findByText(/书写内容仅保存在用户端与加密列中/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/书写内容仅保存/)).toBeNull()   // 不是表单控件
  })

  it('渲染四个阶段开关', async () => {
    render(<ToastHost><RitualPage /></ToastHost>)
    for (const label of ['阶段一 · 未开始', '阶段二 · 准备入睡',
                         '阶段三 · 即将入睡', '阶段四 · 已完成']) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 7: 接进路由**

`admin/src/App.tsx` 里把四个 `Placeholder` 换成真实页面：

```tsx
import BasicPage from './modules/config/BasicPage'
import OnboardingPage from './modules/config/OnboardingPage'
import RecordsPage from './modules/config/RecordsPage'
import RitualPage from './modules/config/RitualPage'
...
<Route path="/config" element={<BasicPage />} />
<Route path="/onboarding" element={<OnboardingPage />} />
<Route path="/ritual" element={<RitualPage />} />
<Route path="/records" element={<RecordsPage />} />
```

- [ ] **Step 8: 跑测试**

```bash
cd admin && npm test && npm run typecheck && npm run build
```

Expected: hook 9 项 + BasicPage 9 项 + RitualPage 5 项全过

- [ ] **Step 9: 手工验证四个模块**

后端与前端都起着，逐页检查：改一个字段 → 点保存 → 看到 diff 弹窗 → 确认 → toast。
特别验证 **在「记录与奖励」页改容差后，去「仪式设置」页刷新，感恩数量没有被清成默认值**
—— 这是全量提交是否真的生效的关键检查。

- [ ] **Step 10: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin-ui): 四个配置模块与保存前 diff 预览`

---

## Task 12: 作品库模块

**Files:**
- Create: `admin/src/modules/art/ArtPage.tsx` / `ArtForm.tsx` / `useArtList.ts`
- Modify: `admin/src/App.tsx`
- Test: `admin/src/modules/art/__tests__/ArtPage.test.tsx`、`admin/src/modules/art/__tests__/ArtForm.test.tsx`

**Interfaces:**
- Consumes: `fetchArt` / `createArt` / `updateArt` / `deleteArt`（Task 9）、`StatusTag` / `ConfirmDialog` / `Field` / `useToast`（Task 10）
- Produces:
  - `useArtList()` → `{ items, total, loading, error, status, setStatus, q, setQ, reload }`
  - `ArtPage` —— 列表 + 筛选 + 搜索 + 三状态操作 + 删除
  - `ArtForm({ initial, onSubmit, onCancel, submitting })` —— 新增与编辑共用

### 三个必须做对的地方

1. **撤回要二次确认**，且确认文案必须说明「已收藏的用户也将看不到」——
   这是撤回与下架的唯一区别，不说清楚运营会当成下架用
2. **`reward_count > 0` 时删除按钮禁用**，并给出 title 提示。后端有 409 兜底，
   但让按钮可点再报错是糟糕的体验
3. **图片路径存在性校验**：`HEAD` 探测拼出的 URL，404 时**黄色警告但不阻止保存**
   —— 文件可能稍后才上传（spec 第六节）

- [ ] **Step 1: 写失败测试**

新建 `admin/src/modules/art/__tests__/ArtPage.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../api/client'
import * as endpoints from '../../../api/endpoints'
import { ToastHost } from '../../../components/Toast'
import type { ArtItem } from '../../../api/types'
import ArtPage from '../ArtPage'

const item = (over: Partial<ArtItem> = {}): ArtItem => ({
  id: 'water-lilies', title: '睡莲', artist: '克劳德·莫奈', year: '1906',
  thumbnail: 'art/wl-thumb.jpg', image: 'art/wl.jpg', alt: '一池睡莲',
  source: 'Public domain', article: '莫奈画了两百多幅睡莲。',
  is_active: true, is_withdrawn: false, status: 'active',
  thumbnail_url: 'http://localhost:8010/static/art/wl-thumb.jpg',
  image_url: 'http://localhost:8010/static/art/wl.jpg',
  reward_count: 0,
  ...over,
})

const renderPage = () => render(<ToastHost><ArtPage /></ToastHost>)

describe('作品库', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue({ items: [item()], total: 1 })
  })

  it('列出作品的标题、艺术家与状态', async () => {
    renderPage()
    expect(await screen.findByText('睡莲')).toBeInTheDocument()
    expect(screen.getByText('克劳德·莫奈')).toBeInTheDocument()
    expect(screen.getByText('上架中')).toBeInTheDocument()
  })

  it('显示缩略图并带 alt', async () => {
    renderPage()
    const img = await screen.findByAltText('一池睡莲')
    expect(img).toHaveAttribute('src', 'http://localhost:8010/static/art/wl-thumb.jpg')
  })

  it('按状态筛选时带上 status 参数', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt')
      .mockResolvedValue({ items: [], total: 0 })
    renderPage()
    await screen.findByLabelText('筛选状态')
    await userEvent.selectOptions(screen.getByLabelText('筛选状态'), 'withdrawn')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('withdrawn', ''))
  })

  it('搜索时带上 q 参数', async () => {
    const spy = vi.spyOn(endpoints, 'fetchArt')
      .mockResolvedValue({ items: [], total: 0 })
    renderPage()
    await userEvent.type(await screen.findByLabelText('搜索'), '莫奈')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith('', '莫奈'))
  })

  it('点下架调用 PATCH is_active=false', async () => {
    const spy = vi.spyOn(endpoints, 'updateArt').mockResolvedValue(
      item({ is_active: false, status: 'inactive' }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '下架' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('water-lilies', { is_active: false }))
  })

  it('已下架的作品显示「上架」按钮', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue({
      items: [item({ is_active: false, status: 'inactive' })], total: 1,
    })
    const spy = vi.spyOn(endpoints, 'updateArt').mockResolvedValue(item())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '上架' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('water-lilies', { is_active: true }))
  })

  it('撤回必须二次确认，且说清已收藏用户也看不到', async () => {
    const spy = vi.spyOn(endpoints, 'updateArt').mockResolvedValue(
      item({ is_withdrawn: true, status: 'withdrawn' }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '撤回' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/已收藏.*也.*看不到/)
    expect(spy).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '确认撤回' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('water-lilies', { is_withdrawn: true }))
  })

  it('删除也要二次确认', async () => {
    const spy = vi.spyOn(endpoints, 'deleteArt').mockResolvedValue(undefined)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '删除' }))
    await screen.findByRole('dialog')
    expect(spy).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('water-lilies'))
  })

  it('被收藏过的作品删除按钮禁用并给出原因', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue({
      items: [item({ reward_count: 7 })], total: 1,
    })
    renderPage()
    const btn = await screen.findByRole('button', { name: '删除' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringContaining('已被收藏'))
    expect(screen.getByText(/被收藏 7 次/)).toBeInTheDocument()
  })

  it('后端返回 409 时把中文原因显示出来', async () => {
    vi.spyOn(endpoints, 'deleteArt').mockRejectedValue(
      new ApiError(409, 'ART_IN_USE', '这幅作品已被收藏，只能下架或撤回，不能删除'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '删除' }))
    await userEvent.click(await screen.findByRole('button', { name: '确认删除' }))
    expect(await screen.findByRole('status')).toHaveTextContent('只能下架或撤回')
  })

  it('空列表时给出提示而不是空白', async () => {
    vi.spyOn(endpoints, 'fetchArt').mockResolvedValue({ items: [], total: 0 })
    renderPage()
    expect(await screen.findByText('没有符合条件的作品')).toBeInTheDocument()
  })

  it('加载失败时显示错误与重试', async () => {
    vi.spyOn(endpoints, 'fetchArt')
      .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接失败')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('点新增打开表单', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '新增作品' }))
    expect(await screen.findByLabelText('标识（slug）')).toBeInTheDocument()
  })
})
```

新建 `admin/src/modules/art/__tests__/ArtForm.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ArtForm from '../ArtForm'

const filled = {
  id: 'starry-night', title: '星夜', artist: '文森特·梵高', year: '1889',
  thumbnail: 'art/sn-thumb.jpg', image: 'art/sn.jpg', alt: '旋转的夜空',
  source: 'Public domain', article: '梵高在圣雷米的疗养院里画下这幅画。',
}

describe('作品表单', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('新增时 slug 可编辑', () => {
    render(<ArtForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('标识（slug）')).not.toBeDisabled()
  })

  it('编辑时 slug 只读——它是收藏与抽卡的稳定标识', () => {
    render(<ArtForm initial={filled} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('标识（slug）')).toHaveAttribute('readonly')
  })

  it('编辑时回填全部字段', () => {
    render(<ArtForm initial={filled} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('标题')).toHaveValue('星夜')
    expect(screen.getByLabelText('艺术家')).toHaveValue('文森特·梵高')
    expect(screen.getByLabelText('文章')).toHaveValue(
      '梵高在圣雷米的疗养院里画下这幅画。')
  })

  it('slug 格式不合法时本地就报错，不用等后端', async () => {
    const onSubmit = vi.fn()
    render(<ArtForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('标识（slug）'), 'Not A Slug!')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText(/只能用小写字母、数字与连字符/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('必填字段为空时报错', async () => {
    const onSubmit = vi.fn()
    render(<ArtForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('标识（slug）'), 'ok-slug')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('不得为空')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('全部填好后提交完整载荷', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ArtForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    for (const [label, value] of [
      ['标识（slug）', filled.id], ['标题', filled.title], ['艺术家', filled.artist],
      ['年份', filled.year], ['缩略图路径', filled.thumbnail],
      ['大图路径', filled.image], ['图片描述（alt）', filled.alt],
      ['来源', filled.source], ['文章', filled.article],
    ] as const) {
      await userEvent.type(screen.getByLabelText(label), value)
    }
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(filled))
  })

  it('图片路径探测 404 时黄色警告但不阻止保存', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ArtForm initial={filled} onSubmit={onSubmit} onCancel={vi.fn()} />)
    expect(await screen.findByText(/这个路径现在取不到文件/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })

  it('探测本身失败时静默——不能因为探测挂了就挡住保存', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ArtForm initial={filled} onSubmit={onSubmit} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd admin && npm test -- art
```

Expected: FAIL —— 找不到 `../ArtPage` / `../ArtForm`

- [ ] **Step 3: 写 `admin/src/modules/art/useArtList.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../../api/client'
import { fetchArt } from '../../api/endpoints'
import type { ArtItem, ArtStatus } from '../../api/types'

export function useArtList() {
  const [items, setItems] = useState<ArtItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ArtStatus | ''>('')
  const [q, setQ] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchArt(status, q)
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    } finally {
      setLoading(false)
    }
  }, [status, q])

  useEffect(() => {
    // 搜索输入防抖 250ms，避免每敲一个字打一次请求
    const timer = setTimeout(() => { void reload() }, q ? 250 : 0)
    return () => clearTimeout(timer)
  }, [reload, q])

  return { items, total, loading, error, status, setStatus, q, setQ, reload }
}
```

- [ ] **Step 4: 写 `admin/src/modules/art/ArtForm.tsx`**

```tsx
import { useEffect, useState } from 'react'

import Field from '../../components/Field'
import type { ArtCreate } from '../../api/types'

const SLUG = /^[a-z0-9][a-z0-9-]*$/

const EMPTY: ArtCreate = {
  id: '', title: '', artist: '', year: '',
  thumbnail: '', image: '', alt: '', source: '', article: '',
}

const REQUIRED: (keyof ArtCreate)[] = [
  'id', 'title', 'artist', 'year', 'thumbnail', 'image', 'alt', 'source', 'article',
]

/** HEAD 探测图片是否已经上传。取不到只警告，不阻止保存——文件可能稍后才放上去。 */
async function probe(path: string): Promise<boolean | null> {
  if (!path.trim()) return null
  try {
    const res = await fetch(`/static/${path.replace(/^\/+/, '')}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return null           // 探测本身失败，什么都不说
  }
}

export default function ArtForm({
  initial, onSubmit, onCancel, submitting,
}: {
  initial?: ArtCreate
  onSubmit: (payload: ArtCreate) => Promise<void> | void
  onCancel: () => void
  submitting?: boolean
}) {
  const isEdit = initial !== undefined
  const [form, setForm] = useState<ArtCreate>(initial ?? EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof ArtCreate, string>>>({})
  const [missingFiles, setMissingFiles] = useState<string[]>([])

  const set = <K extends keyof ArtCreate>(key: K, value: ArtCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      probe(form.thumbnail).then((ok) => (ok === false ? '缩略图' : null)),
      probe(form.image).then((ok) => (ok === false ? '大图' : null)),
    ]).then((results) => {
      if (!cancelled) setMissingFiles(results.filter((r): r is string => r !== null))
    })
    return () => { cancelled = true }
  }, [form.thumbnail, form.image])

  function validate(): boolean {
    const next: Partial<Record<keyof ArtCreate, string>> = {}
    for (const key of REQUIRED) {
      if (!form[key].trim()) next[key] = '不得为空'
    }
    if (form.id.trim() && !SLUG.test(form.id.trim())) {
      next.id = '只能用小写字母、数字与连字符，且以字母或数字开头'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        if (!validate()) return
        void onSubmit({
          ...form,
          ...Object.fromEntries(REQUIRED.map((k) => [k, form[k].trim()])),
        } as ArtCreate)
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0 }}>{isEdit ? '编辑作品' : '新增作品'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
        <Field label="标识（slug）" htmlFor="art-id" error={errors.id}
               hint={isEdit ? '标识不可修改——它是收藏与抽卡的稳定引用'
                            : '小写字母、数字与连字符，如 water-lilies'}>
          <input id="art-id" className="input" value={form.id} readOnly={isEdit}
                 aria-invalid={Boolean(errors.id)}
                 onChange={(e) => set('id', e.target.value)} />
        </Field>

        <Field label="标题" htmlFor="art-title" error={errors.title}>
          <input id="art-title" className="input" value={form.title}
                 aria-invalid={Boolean(errors.title)}
                 onChange={(e) => set('title', e.target.value)} />
        </Field>

        <Field label="艺术家" htmlFor="art-artist" error={errors.artist}>
          <input id="art-artist" className="input" value={form.artist}
                 onChange={(e) => set('artist', e.target.value)} />
        </Field>

        <Field label="年份" htmlFor="art-year" error={errors.year}>
          <input id="art-year" className="input" value={form.year}
                 onChange={(e) => set('year', e.target.value)} />
        </Field>

        <Field label="缩略图路径" htmlFor="art-thumb" error={errors.thumbnail}
               hint="相对 ASSET_BASE_URL，如 art/water-lilies-thumb.jpg">
          <input id="art-thumb" className="input" value={form.thumbnail}
                 onChange={(e) => set('thumbnail', e.target.value)} />
        </Field>

        <Field label="大图路径" htmlFor="art-image" error={errors.image}>
          <input id="art-image" className="input" value={form.image}
                 onChange={(e) => set('image', e.target.value)} />
        </Field>

        <Field label="图片描述（alt）" htmlFor="art-alt" full error={errors.alt}
               hint="给读屏软件用的一句描述">
          <input id="art-alt" className="input" value={form.alt}
                 onChange={(e) => set('alt', e.target.value)} />
        </Field>

        <Field label="来源" htmlFor="art-source" full error={errors.source}
               hint="公共领域的出处说明，如 Public domain, via Wikimedia Commons">
          <input id="art-source" className="input" value={form.source}
                 onChange={(e) => set('source', e.target.value)} />
        </Field>

        <Field label="文章" htmlFor="art-article" full error={errors.article}>
          <textarea id="art-article" className="textarea" rows={6} value={form.article}
                    aria-invalid={Boolean(errors.article)}
                    onChange={(e) => set('article', e.target.value)} />
        </Field>
      </div>

      {missingFiles.length > 0 && (
        <p style={{
          background: 'var(--warn-bg)', color: 'var(--warn)',
          padding: '10px 14px', borderRadius: 10,
        }}>
          {missingFiles.join('与')}：这个路径现在取不到文件。
          如果你还没把图片放到 backend/static/ 下，可以先保存，之后再上传。
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? '保存中…' : '保存'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>取消</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: 写 `admin/src/modules/art/ArtPage.tsx`**

```tsx
import { useState } from 'react'

import { ApiError } from '../../api/client'
import { createArt, deleteArt, updateArt } from '../../api/endpoints'
import ConfirmDialog from '../../components/ConfirmDialog'
import StatusTag from '../../components/StatusTag'
import { useToast } from '../../components/Toast'
import type { ArtCreate, ArtItem, ArtStatus } from '../../api/types'
import ArtForm from './ArtForm'
import { useArtList } from './useArtList'

type Pending =
  | { kind: 'withdraw'; art: ArtItem }
  | { kind: 'delete'; art: ArtItem }
  | null

export default function ArtPage() {
  const list = useArtList()
  const toast = useToast()
  const [editing, setEditing] = useState<ArtItem | 'new' | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, okMessage: string) {
    setBusy(true)
    try {
      await action()
      toast(okMessage)
      await list.reload()
      setEditing(null)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  if (editing !== null) {
    const initial = editing === 'new' ? undefined : {
      id: editing.id, title: editing.title, artist: editing.artist, year: editing.year,
      thumbnail: editing.thumbnail, image: editing.image, alt: editing.alt,
      source: editing.source, article: editing.article,
    }
    return (
      <ArtForm
        initial={initial}
        submitting={busy}
        onCancel={() => setEditing(null)}
        onSubmit={(payload: ArtCreate) =>
          editing === 'new'
            ? run(() => createArt(payload), '已新增')
            : run(() => {
                const { id: _id, ...rest } = payload
                return updateArt(editing.id, rest)
              }, '已保存')
        }
      />
    )
  }

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>作品库</h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            共 {list.total} 幅。下架的不进抽卡池但已收藏用户仍可见；
            撤回的所有人都看不到。
          </p>
        </div>
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }}
                onClick={() => setEditing('new')}>
          新增作品
        </button>
      </header>

      <div className="card" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 200 }}>
          <label htmlFor="art-status">筛选状态</label>
          <select id="art-status" className="select" value={list.status}
                  onChange={(e) => list.setStatus(e.target.value as ArtStatus | '')}>
            <option value="">全部</option>
            <option value="active">上架中</option>
            <option value="inactive">已下架</option>
            <option value="withdrawn">已撤回</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="art-q">搜索</label>
          <input id="art-q" className="input" value={list.q} placeholder="标题、艺术家或标识"
                 onChange={(e) => list.setQ(e.target.value)} />
        </div>
      </div>

      {list.loading && <div className="card">载入中…</div>}

      {!list.loading && list.error && (
        <div className="card">
          <p role="alert" className="field-error">{list.error}</p>
          <button type="button" className="btn" onClick={() => void list.reload()}>
            重试
          </button>
        </div>
      )}

      {!list.loading && !list.error && list.items.length === 0 && (
        <div className="card" style={{ color: 'var(--muted)' }}>没有符合条件的作品</div>
      )}

      {!list.loading && !list.error && list.items.map((art) => (
        <div key={art.id} className="card"
             style={{ display: 'flex', gap: 18, marginBottom: 12, alignItems: 'flex-start' }}>
          <img src={art.thumbnail_url} alt={art.alt}
               style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12,
                        background: 'var(--soft)' }} />

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong>{art.title}</strong>
              <StatusTag status={art.status} />
            </div>
            <div style={{ color: 'var(--muted)' }}>
              {art.artist} · {art.year}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              {art.id}
              {art.reward_count > 0 && ` · 被收藏 ${art.reward_count} 次`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 110 }}>
            <button type="button" className="btn" disabled={busy}
                    onClick={() => setEditing(art)}>
              编辑
            </button>

            {!art.is_withdrawn && (
              <button type="button" className="btn" disabled={busy}
                      onClick={() => void run(
                        () => updateArt(art.id, { is_active: !art.is_active }),
                        art.is_active ? '已下架' : '已上架')}>
                {art.is_active ? '下架' : '上架'}
              </button>
            )}

            {!art.is_withdrawn ? (
              <button type="button" className="btn danger" disabled={busy}
                      onClick={() => setPending({ kind: 'withdraw', art })}>
                撤回
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy}
                      onClick={() => void run(
                        () => updateArt(art.id, { is_withdrawn: false }), '已恢复')}>
                取消撤回
              </button>
            )}

            <button
              type="button"
              className="btn danger"
              disabled={busy || art.reward_count > 0}
              title={art.reward_count > 0
                ? `这幅作品已被收藏 ${art.reward_count} 次，只能下架或撤回，不能删除`
                : undefined}
              onClick={() => setPending({ kind: 'delete', art })}
            >
              删除
            </button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={pending?.kind === 'withdraw'}
        title="确认撤回"
        body={
          <>
            撤回《{pending?.art.title}》后，<strong>已收藏这幅作品的用户也将看不到它</strong>，
            它同时退出抽卡池。
            <br />
            如果只是想让它不再被抽到，请用「下架」——下架后已收藏的用户仍能看到。
          </>
        }
        confirmLabel="确认撤回"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const art = pending?.art
          if (art) void run(() => updateArt(art.id, { is_withdrawn: true }), '已撤回')
        }}
      />

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title="确认删除"
        body={
          <>
            《{pending?.art.title}》将被<strong>永久删除</strong>，无法恢复。
            <br />
            如果只是想让它不再出现，用「下架」或「撤回」。
          </>
        }
        confirmLabel="确认删除"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const art = pending?.art
          if (art) void run(() => deleteArt(art.id), '已删除')
        }}
      />
    </>
  )
}
```

- [ ] **Step 6: 接进路由**

`admin/src/App.tsx`：

```tsx
import ArtPage from './modules/art/ArtPage'
...
<Route path="/art" element={<ArtPage />} />
```

- [ ] **Step 7: 跑测试**

```bash
cd admin && npm test && npm run typecheck && npm run build
```

Expected: ArtPage 13 项 + ArtForm 8 项全过

- [ ] **Step 8: 手工验证**

后端与前端都起着，在 `/art` 页面：
新增一幅作品（图片路径填一个不存在的，确认出黄色警告但能保存）→ 下架 → 上架 →
撤回（确认弹窗文案说清了「已收藏的用户也看不到」）→ 取消撤回 → 删除。
再对 seed 进去的 10 幅真实作品之一试删除，Expected: 若已被收藏则按钮是禁用的。

- [ ] **Step 9: 记录改动**

**不执行 git 命令。** 建议 commit message：`feat(admin-ui): 作品库的增删改与三状态流转`

---

## Task 13: 契约测试与整体验收

最后一道。契约测试是「类型完全独立」这个决策的唯一防线 —— 后端改字段名时，
它是唯一会红的东西。

**Files:**
- Create: `admin/src/api/__tests__/contract.test.ts`
- Create: `admin/VERIFY.md`
- Create: `admin/README.md`
- Modify: `CLAUDE.md`（补 `admin/` 的命令与约束）

**Interfaces:**
- Consumes: 后端 `/openapi.json`、`admin/src/api/types.ts`
- Produces: 可重复执行的契约校验、人工验收清单

### 契约测试怎么拿到 OpenAPI

后端必须在跑。**不起后端时这条测试跳过而不是失败** —— 否则 `npm test` 在
没有后端的机器上永远红，开发者会开始习惯性忽略红色，那比没有这条测试更糟。
但 CI 与发布前必须起着后端跑一次，`VERIFY.md` 里有这一条。

- [ ] **Step 1: 写契约测试**

新建 `admin/src/api/__tests__/contract.test.ts`：

```ts
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * 与后端 OpenAPI 逐字段比对。
 *
 * 「类型完全独立」是用户的决策（两个前端零耦合），代价是 types.ts 可能与后端漂移。
 * 这条测试就是那个代价的对冲：后端改字段名 → 这里红。
 *
 * 需要后端在 127.0.0.1:8010 跑着。没跑时 skip 而非 fail——让 npm test 在没有
 * 后端的机器上永远红，只会训练开发者忽略红色。发布前必须起着后端跑一次，
 * VERIFY.md 有这一条。
 */

const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:8010'

interface Schema {
  properties?: Record<string, unknown>
  required?: string[]
}

let spec: { paths: Record<string, unknown>; components: { schemas: Record<string, Schema> } } | null = null

beforeAll(async () => {
  try {
    const res = await fetch(`${BACKEND}/openapi.json`)
    if (res.ok) spec = await res.json()
  } catch {
    spec = null
  }
})

const props = (name: string): string[] => {
  const schema = spec!.components.schemas[name]
  expect(schema, `后端没有 schema ${name}`).toBeDefined()
  return Object.keys(schema.properties ?? {}).sort()
}

describe('与后端 OpenAPI 的契约', () => {
  it.skipIf(!spec)('后端暴露了全部 9 条 admin 路径', () => {
    const expected = [
      '/api/v1/admin/login',
      '/api/v1/admin/me',
      '/api/v1/admin/config',
      '/api/v1/admin/config/export',
      '/api/v1/admin/art',
      '/api/v1/admin/art/{art_id}',
    ]
    for (const path of expected) {
      expect(Object.keys(spec!.paths)).toContain(path)
    }
  })

  it.skipIf(!spec)('AppSection 的字段与 types.ts 一致', () => {
    expect(props('AppSection')).toEqual([
      'anonymous_analytics_enabled', 'home_question', 'name',
      'onboarding_enabled', 'reduce_motion_default', 'skip_tonight_enabled', 'slogan',
    ])
  })

  it.skipIf(!spec)('ScheduleSection 的字段一致', () => {
    expect(props('ScheduleSection')).toEqual(
      ['bedtime', 'max_time', 'min_time', 'wake_time'])
  })

  it.skipIf(!spec)('OnboardingSection 的字段一致', () => {
    expect(props('OnboardingSection')).toEqual([
      'guest_copy', 'guide_gift', 'guide_light', 'guide_rest',
      'skip_story_enabled', 'story_poster', 'story_status', 'story_video_path',
      'welcome_title',
    ])
  })

  it.skipIf(!spec)('RitualSection 的字段一致', () => {
    expect(props('RitualSection')).toEqual([
      'dim_minutes', 'goodnight_text', 'gratitude_count', 'interrupt_text',
      'plan_count', 'resistance_options', 'resistance_reply', 'ritual_minutes',
      'stage_done_enabled', 'stage_not_started_enabled', 'stage_quieting_enabled',
      'stage_wind_down_enabled', 'tolerance_minutes',
    ])
  })

  it.skipIf(!spec)('RecordsSection 的字段一致', () => {
    expect(props('RecordsSection')).toEqual([
      'collection_empty_copy', 'collection_limit', 'comparison_copy',
      'image_fallback_enabled', 'journal_days', 'journal_empty_copy',
      'random_art_enabled', 'reward_copy', 'reward_timing',
    ])
  })

  it.skipIf(!spec)('AdminArtItem 的字段与 ArtItem 一致', () => {
    expect(props('AdminArtItem')).toEqual([
      'alt', 'article', 'artist', 'id', 'image', 'image_url', 'is_active',
      'is_withdrawn', 'reward_count', 'source', 'status', 'thumbnail',
      'thumbnail_url', 'title', 'year',
    ])
  })

  it.skipIf(!spec)('AdminMeResponse 的字段一致', () => {
    expect(props('AdminMeResponse')).toEqual(['last_login_at', 'username'])
  })

  it.skipIf(!spec)('ConfigDiffResponse 用 from/to 而不是 old/new', () => {
    expect(props('ConfigChangeItem')).toEqual(['from', 'path', 'to'])
  })

  it.skipIf(!spec)('reward_timing 只有两个合法值', () => {
    const schema = spec!.components.schemas['RecordsSection'] as {
      properties: Record<string, { enum?: string[] }>
    }
    expect(schema.properties['reward_timing']?.enum?.sort())
      .toEqual(['immediate', 'next-day'])
  })

  it.skipIf(!spec)('admin 路径里没有任何用户数据接口', () => {
    const adminPaths = Object.keys(spec!.paths).filter((p) => p.includes('/admin'))
    expect(adminPaths.length).toBeGreaterThan(0)
    for (const path of adminPaths) {
      expect(path.toLowerCase()).not.toMatch(/user|night|record|journal|event/)
    }
  })

  it('没起后端时说明清楚，避免误以为通过了', () => {
    if (!spec) {
      console.warn(
        `\n⚠️  后端未运行（${BACKEND}），契约测试已跳过。\n` +
        `   发布前必须起着后端跑一次：cd backend && .venv/bin/uvicorn app.main:app --port 8010\n`,
      )
    }
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: 起后端跑契约测试**

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8010 &
sleep 3
cd ../admin && npm test -- contract
kill %1
```

Expected: 12 项全过。**任何一条红都说明 `types.ts` 与后端漂移了，改 `types.ts`
去对齐后端**（后端是权威），不要改断言。

- [ ] **Step 3: 跑前端全量**

```bash
cd admin && npm test && npm run typecheck && npm run build
```

Expected: 全绿。统计一下总测试数写进小结。

- [ ] **Step 4: 跑后端全量**

```bash
cd backend && .venv/bin/python -m pytest -q
```

Expected: 0 failed，且**总数不低于 279** —— 这是「阶段一 189 项必须保持全绿」这条
全局约束的最终确认。

- [ ] **Step 5: 写 `admin/VERIFY.md`**

人工验收清单。**必须包含**以下几类，每条一个 `- [ ]`：

```markdown
# 后台管理系统人工验收清单

自动化测试盖不到的部分。上线前逐条走一遍，勾完为止。

## 一、部署与启动

- [ ] `cd admin && npm run build` 产出 `dist/`，用 `npx serve dist` 能打开
- [ ] Nginx 配置：`/` 指向 `dist/`，`/api` 与 `/static` 反代到后端，`try_files ... /index.html`
      （BrowserRouter 需要，否则刷新 `/art` 会 404）
- [ ] 后端 `.env` 里 `ADMIN_CORS_ORIGINS` 留空（同源部署）
- [ ] 若分域名部署：设 `ADMIN_CORS_ORIGINS=https://你的后台域名`，重启后端，
      确认浏览器控制台无 CORS 报错

## 二、账号与安全

- [ ] 用 `python -m scripts.create_admin <你的用户名>` 建正式账号（**密码 ≥ 12 位**）
- [ ] **删掉或重置 Task 3 建的 `devadmin` 开发账号**
- [ ] 输错密码 5 次后第 6 次显示「尝试次数过多，请一分钟后再试」
- [ ] 停用某个管理员（库里 `UPDATE admin_users SET is_active = false`），
      该账号已登录的会话下一次操作立刻被踢出
- [ ] 用小程序的 access_token 打 `/api/v1/admin/me`，返回 401
- [ ] 关掉浏览器标签再打开，需要重新登录（token 在 sessionStorage）
- [ ] 登录后等 8 小时以上再操作，被要求重新登录
- [ ] 浏览器 DevTools 的 Network 里，任何 admin 响应都不含 `hashed_password` 或 `$2b$`

## 三、隐私

- [ ] 遍历后台全部 5 个页面，**没有任何入口能看到用户、夜记、感恩或明日计划**
- [ ] `grep -rn "decrypt\|NightRecord\|AnalyticsEvent" backend/app/api/v1/admin/` 无输出
- [ ] `curl` 试探 `/api/v1/admin/users`、`/api/v1/admin/nights` 均返回 404

## 四、运营配置

- [ ] 四个配置页各改一个字段，diff 弹窗里列出的**就是**你改的那些，一条不多一条不少
- [ ] 改「按时完成容差」时，diff 弹窗顶部出现黄色警告，写明历史夜记不会被修正
- [ ] 把「可选最早」与「可选最晚」设成同一个时间，保存被拒并在字段旁标红
- [ ] 「导出快照」下载到一个 JSON，内容与当前配置一致
- [ ] 在「记录与奖励」页保存后，去「仪式设置」页刷新，**感恩数量没有被清成默认值**
- [ ] 改完配置后，小程序端（或 `curl /api/v1/config`）读到的是新值
- [ ] 把 `app_config.data` 手动改成 `{"bad": 1}`，`curl /api/v1/config` 仍返回默认值且 200
- [ ] 停掉 Redis，保存配置仍然成功

## 五、作品库

- [ ] 新增一幅作品，图片路径填不存在的文件：出黄色警告但**能保存**
- [ ] 把图片放到 `backend/static/` 对应路径后重新打开编辑，警告消失
- [ ] 下架一幅作品：它退出抽卡池，但用小程序看已收藏的它仍可见
- [ ] 撤回一幅作品：确认弹窗明确说「已收藏的用户也将看不到」；撤回后小程序看不到了
- [ ] 取消撤回后恢复可见
- [ ] 对一幅**被收藏过**的作品，删除按钮是禁用的，鼠标悬停给出原因
- [ ] 用 `curl` 绕过前端直接 `DELETE` 一幅被收藏过的作品，返回 409 且作品仍在
- [ ] 编辑时 slug 输入框是只读的
- [ ] 搜索「莫奈」能搜到，筛选「已撤回」只出撤回的

## 六、契约与回归

- [ ] 起着后端跑 `cd admin && npm test -- contract`，12 项全过（不是 skip）
- [ ] `cd backend && .venv/bin/python -m pytest -q` 全绿，总数 ≥ 279
- [ ] `cd admin && npm run typecheck` 无错
- [ ] `cd miniprogram && npm test` 仍全绿（阶段一没有被本阶段改动破坏）

## 七、上线前必办

- [ ] **轮换数据库密码与 Redis 密码** —— 它们曾在对话中以明文出现，视为已泄露
- [ ] 确认 `FERNET_KEYS` 已备份到密码管理器（丢失 = 所有历史夜记正文永久不可读）
- [ ] `.env` 的 `ENV=production`，且 `WX_MOCK_LOGIN` 为 false（否则进程拒绝启动）
- [ ] 后台不要暴露在公网；用内网、VPN 或 IP 白名单限制访问
```

- [ ] **Step 6: 写 `admin/README.md`**

```markdown
# 烛生 · 管理后台

React 18 + Vite + TypeScript。构建产物是纯静态文件，Nginx 直接 serve。

## 开发

```bash
npm install
npm run dev          # http://localhost:5174，/api 已代理到 127.0.0.1:8010
```

需要后端同时在跑：

```bash
cd ../backend && .venv/bin/uvicorn app.main:app --reload --port 8010
```

首次使用要先建管理员：

```bash
cd ../backend && .venv/bin/python -m scripts.create_admin <username>
```

## 命令

```bash
npm run dev          # 开发服务器
npm run build        # 产出 dist/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm test -- contract # 只跑与后端 OpenAPI 的契约测试（需要后端在跑）
```

## 与小程序端的关系

**没有共享代码。** `src/api/types.ts` 独立定义，不从 `miniprogram/` 引用任何文件。
这是刻意的决策（两个前端零耦合），代价是可能与后端漂移，由
`src/api/__tests__/contract.test.ts` 与后端 `/openapi.json` 逐字段比对来兜。

后端改了字段名 → 契约测试红 → 改 `types.ts` 对齐后端（后端是权威）。

## 部署

```nginx
location / {
    root /var/www/zhusheng-admin;
    try_files $uri $uri/ /index.html;    # BrowserRouter 需要
}
location /api  { proxy_pass http://127.0.0.1:8010; }
location /static { proxy_pass http://127.0.0.1:8010; }
```

同源部署时后端不需要开 CORS。分域名部署设 `ADMIN_CORS_ORIGINS`。

**这个后台不应暴露在公网。** 它能改全局配置，用内网、VPN 或 IP 白名单限制访问。

## 隐私约束

管理后台**没有任何接口能看到用户个人数据** —— 不列用户、不读夜记、不解密正文。
后端由 `backend/tests/test_admin_privacy.py` 的 AST 扫描把守，前端由
`src/layout/__tests__/Sidebar.test.tsx` 确认界面上也没有入口。

做阶段三的数据看板时，这条约束需要显式重新设计，不要顺手越界。
```

- [ ] **Step 7: 更新根目录 `CLAUDE.md`**

在「## 命令」一节后追加：

```markdown
### 后台前端（admin/）

```bash
cd admin
npm run dev          # 开发服务器，/api 代理到 127.0.0.1:8010
npm run build        # 产出 dist/，交 Nginx
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm test -- contract # 与后端 OpenAPI 的契约测试（需要后端在跑）
```
```

并在「## 架构」一节加一小段：

```markdown
### 管理后台的隐私硬约束

`app/api/v1/admin/` 与 `app/services/admin*.py` **不得引用** `decrypt_text` /
`decrypt_list` / `NightRecord` / `AnalyticsEvent`。由 `tests/test_admin_privacy.py`
的 AST 扫描把守。后台不列用户、不读夜记、不解密任何正文。

阶段三做数据看板时这条约束需要显式重新设计，不要顺手越界。

### 运营配置

配置存 `app_config` 表的单行 JSONB（`CHECK (id = 1)`），**不做版本化**——
用户明确选择了单行覆盖，代价是改错不可逆，防线是保存前 diff 预览与手动导出快照。

`GET /api/v1/config`（公开）查库优先、坏数据回落 `domain/config.py` 的常量。
**回落路径不能删**：小程序启动就要读它，让它 500 等于让所有用户开不了 App。

规范形状与 42 个字段见 `docs/superpowers/plans/2026-08-31-zhusheng-admin.md` 开头。
```

- [ ] **Step 8: 最终全量确认**

```bash
cd backend && .venv/bin/python -m pytest -q
cd ../admin && npm test && npm run typecheck && npm run build
cd ../miniprogram && npm test
```

Expected: 三处全绿。miniprogram 那条特别重要 —— 本阶段改了后端的
`GET /config` 与错误 `message`，要确认阶段一交付物没被破坏。

- [ ] **Step 9: 记录改动**

**不执行 git 命令。** 小结列出全部新增文件，给出建议的 commit message：
`feat(admin): 阶段二后台管理系统（后端 admin 路由 + admin/ 前端）`

同时把这些数字写进小结，作为交付报告的素材：
- 后端测试总数、admin 相关测试数
- 前端测试总数
- 接口数、配置字段数
- `admin/dist` 的体积

---

## 自查记录

写完后对照 spec 逐节核对的结果。

**spec 覆盖**：

| spec 章节 | 对应任务 |
|---|---|
| 一、整体结构（含 CORS 裁决） | Task 4 Step 9、Task 8 |
| 二、鉴权：两套 token 隔离 | Task 3、Task 4 |
| 二、密码（bcrypt / CLI 建号 / 不注册不改密 / 限流） | Task 3、Task 4 |
| 三、隐私硬约束 + AST 测试 | Task 7 |
| 四、数据模型（两张表 + CHECK + JSONB） | Task 2 |
| 四、GET /config 查库优先回落 | Task 5 Step 8 |
| 五、校验规则（8 条） | Task 5 Step 4 |
| 五、dry_run diff | Task 5、Task 11 |
| 五、生效时机与 Redis 缓存失效 | Task 5 Step 5 |
| 六、作品管理（6 个操作 + 三状态 + 409 + 路径探测） | Task 6、Task 12 |
| 七、9 条接口清单 | Task 4–6，Task 13 契约测试逐条核对 |
| 八、前端结构 | Task 8–12 |
| 八、契约测试 | Task 13 |
| 九、错误处理 + 新增 4 个错误码 | Task 7 |
| 十、测试文件清单 | Task 3–7、13 |

**四项已确定的决策**都落到了实现：用户名密码（Task 3/4）、5 个模块全做
（Task 11 四个 + Task 12 一个）、React+Vite 类型独立（Task 8/9 + Task 13 契约）、
单行覆盖不版本化（Task 2 的 `CHECK (id = 1)`，防线在 Task 11 的 diff 与导出）。

**对 spec 的两处偏离**，都写在了对应任务里：

1. **依赖**：`passlib[bcrypt]` → `bcrypt>=5.0`。实测 passlib 1.7.4 与 bcrypt 5.0
   不兼容且 passlib 已无维护（Task 3 有实测输出与理由）
2. **字段数**：spec 说 34 个，实际原型有 43 个 `name` 属性，其中
   `privateWriting` 剔除（正文加密是架构保证不是运营开关），最终 42 个

**新增但 spec 未列的错误码**：`ADMIN_NOT_FOUND`、`TOO_MANY_ATTEMPTS`、
`PASSWORD_TOO_LONG`、`ART_ID_TAKEN`。前三个是 spec 描述的行为（停用账号、限流、
72 字节上限）必然需要的码，第四个是 slug 手填必然需要的。

**类型一致性核对**：`AdminConfigPayload` 的 5 个嵌套组名（Task 5）与
`domain/config.py` 的 `RuntimeConfig` 字段名（Task 1）一致；前端 `types.ts`
（Task 9）的字段名与后端 schema 一致，且由 Task 13 的契约测试逐条断言；
`ConfigChangeItem` 用 `from`/`to`（alias），`ConfigChange`（domain）用 `old`/`new`
—— 转换点只有 Task 5 Step 6 一处，契约测试有一条专门断言对外是 `from`/`to`。

**占位符扫描**：初稿有两处测试代码写得别扭，并附了「实现时简化成……」的注记——
那是计划缺陷而不是注记（执行者会照着别扭的版本写）。已就地改成可直接运行的写法
并删掉注记：Task 9 的「提交中禁用按钮」、Task 13 的冗余 `describe.skipIf`。
全文再扫一遍，无 TBD / TODO / 「类似 Task N」/ 无代码的实现步骤。

---

## 执行记录（2026-08-31）

13 个任务全部执行完毕。以下是**计划与实际的偏差**，以及执行中发现的、计划里没预见到的问题。
留在这里是因为仓库没有 git，这份文档是唯一的改动记录。

### 计划本身的错误（6 处）

| # | 计划写的 | 实际 | 影响 |
|---|---|---|---|
| 1 | 依赖加到 `backend/requirements.txt` | 该文件不存在，依赖在 `pyproject.toml` | 改文件名 |
| 2 | `NightRecord(user_id, ritual_date, is_eligible, late_minutes, reward_draw_count)` | 还有 `planned_at` / `completed_at` 两个 NOT NULL 字段 | Task 6 测试报 NotNullViolation |
| 3 | `Reward(..., revealed_at=...)` | 字段名是 `awarded_at` | Task 6 测试报 TypeError |
| 4 | 隐私测试遍历 `app.routes` 枚举路由 | 本版 FastAPI 的 `include_router` 存 `_IncludedRouter` 包装对象，`app.routes` **不展平子路由** | 会扫出空集 → 一个「永远通过」的假测试。改用 `app.openapi()` |
| 5 | 契约测试在 `beforeAll` 里取 OpenAPI | `it.skipIf(...)` 在**收集阶段**求值，那时 `beforeAll` 未跑，`spec` 恒为 null | **11 条断言从不执行**，报告显示「1 passed / 11 skipped」，看起来像后端没起。改用模块顶层 `await`，并加了一条永不 skip 的哨兵断言 |
| 6 | `status.HTTP_422_UNPROCESSABLE_ENTITY` | 本版 Starlette 已弃用，改 `HTTP_422_UNPROCESSABLE_CONTENT` | 21 条弃用告警 |

第 4、5 两条是同一类错误：**守门测试自己失效了却显示通过**。第 4 条我在计划里主动
警告过（并写了 `test_there_are_admin_files_to_scan` 这样的自守门），第 5 条却犯了同样的错。

### 实现中发现的真 bug（4 处）

1. **阻力选项打不出第二项**（`RitualPage`）。textarea 每次按键都用「过滤掉空行的数组」
   回填，回车产生的尾部换行被立刻吃掉。改成本地保留原始文本，只在写入配置时过滤。
   `VERIFY.md` 加了一条专门验它。
2. **登录测试会随机红**。限流走真实 Redis，key 是 `admin:login:<IP>`，测试里所有请求
   来自同一 IP，60 秒的桶跨测试累积到第 6 次就吃 429。单文件跑时窗口可能刚好滚过去而
   侥幸通过，全量跑就红。加了 autouse fixture 清桶（清测试间共享状态，不改生产代码）。
3. **`response.text()` 可能抛而冒泡成裸 TypeError**（`api/client.ts`）。body 已被消费或
   连接中断时，调用方 catch 的不再是 `ApiError`。已包进 try/catch。
4. **42 个配置字段完全不在 OpenAPI 里**。`PUT /config` 为了让 dry-run 把校验错误当数据
   返回而收裸 `dict`，导致 `AdminConfigPayload` 与 5 个 Section 从不进 components ——
   `/docs` 不描述请求体，契约测试也无从比对。修法：`AdminConfigResponse.config` 从 `dict`
   改为 `AdminConfigPayload`（响应确实是这个形状），`PUT` 加 `responses` 与 `openapi_extra`
   补回请求体文档，同时保留裸 dict 的解析行为。

### 环境层面的发现（2 处）

- **这台开发机的 8000 端口属于另一个 FastAPI 项目**。admin 的 dev 代理若指向 8000，
  会把管理员用户名密码发给别人的服务。已把开发端口统一改为 **8010**
  （`vite.config.ts`、README、VERIFY、契约测试默认值）。生产无影响。
- **`ASSET_BASE_URL` 原为 `http://localhost:8000/static`**，同样指向另一个项目。已改 8010。
  原值备份在会话 scratchpad。上线时应改为对象存储或正式域名。

### 与计划一致的部分

任务划分、TDD 步骤、42 字段的规范形状与跨 5 处一致性、隐私 AST 约束、
单行覆盖 + diff 预览 + 导出快照的组合、bcrypt 直接依赖的选型，都按计划执行，
未做调整。

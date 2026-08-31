"""运营配置。

【domain 层硬约束】本模块不导入 SQLAlchemy / Redis / httpx，不读环境变量，
不调用 datetime.now()，不读系统本地时区。tests/test_domain_purity.py 把守。

配置的存储形状是这里 config_to_dict() 的输出，直接进 app_config.data 的 JSONB。
"""

from dataclasses import dataclass, field, fields
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

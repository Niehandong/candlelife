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

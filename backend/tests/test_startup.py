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


def test_empty_fernet_keys_rejected():
    with pytest.raises(ValueError, match="FERNET_KEYS"):
        _settings(fernet_keys="   ")


def test_development_allows_mock_login():
    assert _settings().wx_mock_login is True


def test_app_boots():
    assert create_app() is not None


def test_test_suite_never_calls_real_wechat():
    """跑测试时必须走微信桩，不管 .env 里那个开关是什么值。

    conftest.py 在 import 阶段设了 WX_MOCK_LOGIN=true。若那几行被删掉，
    这条会红 —— 而不是让整个测试套件在某天悄悄开始向微信发真实请求
    （用假 code、全部失败、还消耗每日配额）。
    """
    import os

    from app.core.config import get_settings

    assert os.environ.get("WX_MOCK_LOGIN") == "true", (
        "conftest.py 里强制 mock 的那几行没了 —— 测试会去打真微信")
    assert get_settings().wx_mock_login is True


def test_development_allows_real_wechat_too():
    """development 下【也允许】关掉 mock 走真微信 —— 那不是 production 专属。

    原先只有 test_development_allows_mock_login，写法上把「允许开」
    钉成了「必须开」的印象。补这一条把两个方向都说清楚。
    """
    s = _settings(wx_mock_login=False, wx_appid="wx0123456789abcdef",
                  wx_secret="0" * 32)
    assert s.wx_mock_login is False

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

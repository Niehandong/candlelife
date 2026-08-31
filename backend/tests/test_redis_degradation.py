"""Redis 是优化不是正确性依赖——连不上时业务必须照常正确。"""
import pytest

from app.core import redis as redis_mod


async def test_ping_reachable_or_gracefully_false():
    """能连上就 True，连不上也只能是 False，绝不抛异常。"""
    assert await redis_mod.ping() in (True, False)


async def test_key_prefix_isolates_project():
    assert redis_mod.key("lock", "night").startswith("zhusheng:")


async def test_ping_false_when_unreachable(monkeypatch):
    from app.core.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("REDIS_HOST", "127.0.0.1")
    monkeypatch.setenv("REDIS_PORT", "1")
    redis_mod.reset_client()
    try:
        assert await redis_mod.ping() is False
    finally:
        redis_mod.reset_client()
        get_settings.cache_clear()


@pytest.mark.parametrize("endpoint", ["/api/v1/config", "/health"])
async def test_endpoints_work_without_redis(client, endpoint, monkeypatch):
    monkeypatch.setattr(redis_mod, "get_redis", lambda: None)
    assert (await client.get(endpoint)).status_code == 200

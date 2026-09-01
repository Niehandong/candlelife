"""微信客户端的【非 mock】路径。

这条路径此前几乎没有测试 —— 因为开发期 WX_MOCK_LOGIN=true，它一行都不会执行。
等真的填上 AppID 关掉 mock，第一次执行就是在生产。所以这里把它单独测一遍。
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.core.errors import ApiError
from app.services.wechat import WeChatClient


class _Resp:
    """httpx 响应的最小替身。"""

    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


def _real_mode(monkeypatch):
    """把 wx_mock_login 关掉，让真实路径生效。"""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "wx_mock_login", False)
    monkeypatch.setattr(settings, "wx_appid", "wxtestappid")
    monkeypatch.setattr(settings, "wx_secret", "testsecret")


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    """默认不走 Redis —— 免得测试之间靠缓存互相影响。

    需要测缓存本身的用例自己 patch 回来。
    """
    monkeypatch.setattr("app.services.wechat.get_redis", lambda: None)


# ── code_to_session ─────────────────────────────────────────────────

async def test_mock_mode_returns_stub_openid():
    """mock 开着时不碰网络。"""
    assert await WeChatClient().code_to_session("abc") == "mock_openid_abc"


async def test_real_mode_returns_openid(monkeypatch):
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"openid": "o_real", "session_key": "k"}))):
        assert await WeChatClient().code_to_session("code123") == "o_real"


async def test_invalid_code_raises_wx_code_invalid(monkeypatch):
    """微信返回 errcode 而不是 openid（40029 code 无效 / 40163 code 已用过）。"""
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"errcode": 40029, "errmsg": "invalid code"}))):
        with pytest.raises(ApiError) as exc:
            await WeChatClient().code_to_session("used")
    assert exc.value.code == "WX_CODE_INVALID"


async def test_network_failure_is_not_an_internal_error(monkeypatch):
    """微信侧不通时给「微信服务暂时不可用」，不是「服务器内部错误」。

    原实现没有 try/except，网络抖动会冒泡成未捕获异常 → 50000。
    用户看到「服务器内部错误」会以为是我们挂了。
    """
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get", AsyncMock(side_effect=OSError("connection reset"))):
        with pytest.raises(ApiError) as exc:
            await WeChatClient().code_to_session("x")
    assert exc.value.code == "WX_TOKEN_UNAVAILABLE"


async def test_errcode_is_not_leaked_to_the_user(monkeypatch):
    """微信的 errmsg 不得进入对外文案。"""
    from app.core.errors import ERROR_MESSAGES
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"errcode": 40013, "errmsg": "invalid appid"}))):
        with pytest.raises(ApiError) as exc:
            await WeChatClient().code_to_session("x")
    assert "appid" not in ERROR_MESSAGES[exc.value.code]


# ── check_text ──────────────────────────────────────────────────────

async def test_mock_mode_passes_any_text():
    assert await WeChatClient().check_text("随便什么") is True


async def test_check_text_passes_when_errcode_is_zero(monkeypatch):
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"access_token": "TK", "expires_in": 7200}))), \
         patch("httpx.AsyncClient.post",
               AsyncMock(return_value=_Resp({"errcode": 0}))):
        assert await WeChatClient().check_text("夜行人") is True


async def test_check_text_rejects_when_content_is_flagged(monkeypatch):
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"access_token": "TK"}))), \
         patch("httpx.AsyncClient.post",
               AsyncMock(return_value=_Resp({"errcode": 87014, "errmsg": "risky content"}))):
        assert await WeChatClient().check_text("违规内容") is False


async def test_check_text_rejects_when_wechat_is_down(monkeypatch):
    """微信侧故障时【拒绝】而不是放行 —— 宁可改不了昵称，也不让违规内容进库。"""
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get", AsyncMock(side_effect=OSError("timeout"))):
        assert await WeChatClient().check_text("任何内容") is False


# ── access_token 缓存 ───────────────────────────────────────────────

async def test_access_token_is_cached_in_redis(monkeypatch):
    """拿过一次之后不再向微信要第二次。

    【为什么要紧】cgi-bin/token 有每日配额。原实现每次 check_text 都取一次
    新 token，配额打光后 check_text 一路返回 False —— 表现为「所有人都改不了
    昵称」，而且日志里只看到一句「内容安全检测失败」，很难往配额上想。
    """
    _real_mode(monkeypatch)
    store: dict[str, str] = {}
    fake = AsyncMock()
    fake.get = AsyncMock(side_effect=lambda k: store.get(k))
    fake.set = AsyncMock(side_effect=lambda k, v, ex=None: store.__setitem__(k, v))
    monkeypatch.setattr("app.services.wechat.get_redis", lambda: fake)

    token_call = AsyncMock(return_value=_Resp({"access_token": "TK-1"}))
    with patch("httpx.AsyncClient.get", token_call), \
         patch("httpx.AsyncClient.post", AsyncMock(return_value=_Resp({"errcode": 0}))):
        await WeChatClient().check_text("第一次")
        await WeChatClient().check_text("第二次")
        await WeChatClient().check_text("第三次")

    assert token_call.await_count == 1, (
        f"向微信取了 {token_call.await_count} 次 access_token，应当只取 1 次后走缓存")


async def test_token_cache_ttl_is_shorter_than_wechat_expiry(monkeypatch):
    """缓存 TTL 必须短于微信的 7200 秒，否则会拿到一张刚好过期的 token。"""
    _real_mode(monkeypatch)
    recorded: dict = {}
    fake = AsyncMock()
    fake.get = AsyncMock(return_value=None)
    fake.set = AsyncMock(side_effect=lambda k, v, ex=None: recorded.update(ex=ex))
    monkeypatch.setattr("app.services.wechat.get_redis", lambda: fake)

    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"access_token": "TK"}))), \
         patch("httpx.AsyncClient.post", AsyncMock(return_value=_Resp({"errcode": 0}))):
        await WeChatClient().check_text("x")

    assert 0 < recorded["ex"] < 7200, f"TTL={recorded['ex']}，应当短于微信的 7200 秒"


async def test_works_without_redis(monkeypatch):
    """Redis 不可用时降级为每次都取 —— 慢一点、费配额，但不影响功能。

    这是项目的一贯原则：Redis 是优化，不是正确性依赖。
    """
    _real_mode(monkeypatch)
    monkeypatch.setattr("app.services.wechat.get_redis", lambda: None)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"access_token": "TK"}))), \
         patch("httpx.AsyncClient.post", AsyncMock(return_value=_Resp({"errcode": 0}))):
        assert await WeChatClient().check_text("x") is True


async def test_token_fetch_failure_raises_unavailable(monkeypatch):
    """拿不到 token 时抛 WX_TOKEN_UNAVAILABLE（会被 check_text 吞成 False）。"""
    _real_mode(monkeypatch)
    with patch("httpx.AsyncClient.get",
               AsyncMock(return_value=_Resp({"errcode": 40013, "errmsg": "invalid appid"}))):
        with pytest.raises(ApiError) as exc:
            await WeChatClient()._fetch_token()
    assert exc.value.code == "WX_TOKEN_UNAVAILABLE"

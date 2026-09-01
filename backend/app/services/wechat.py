"""微信开放接口：code2Session 与内容安全检测。

WX_MOCK_LOGIN=true 时全部走本地桩，无需 AppID 即可在开发者工具中完整调试。
production 下该开关会导致进程拒绝启动（见 core/config.py）。

【关掉 mock 之前要知道的两件事】

1. `access_token` 有【每日配额】，且它是全局的（同一个 AppID 只有一张）。
   每次调用都去 cgi-bin/token 拿一次，配额很快见底 —— 之后 check_text 会
   一路返回 False，表现为「所有人都改不了昵称」。所以这里缓存在 Redis 里。

2. 微信侧网络抖动时，code2Session 与 msg_sec_check 都应该给出
   「微信服务暂时不可用」而不是「服务器内部错误」—— 前者用户知道稍后重试，
   后者会让人以为是我们挂了。
"""
import logging

import httpx

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.redis import get_redis, key

logger = logging.getLogger("zhusheng")

_API = "https://api.weixin.qq.com"
_TIMEOUT = 5.0

# access_token 官方有效期 7200 秒。提前 5 分钟过期，避免拿到一张
# 「还剩两秒」的 token 去发请求。
_TOKEN_TTL = 7200 - 300
_TOKEN_KEY = "wx:access_token"


class WeChatClient:
    async def code_to_session(self, code: str) -> str:
        settings = get_settings()
        if settings.wx_mock_login:
            return f"mock_openid_{code}"

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(
                    f"{_API}/sns/jscode2session",
                    params={"appid": settings.wx_appid, "secret": settings.wx_secret,
                            "js_code": code, "grant_type": "authorization_code"},
                )
            data = resp.json()
        except Exception:
            # 网络不通、超时、响应不是 JSON —— 都是「微信那边的事」，
            # 不能冒泡成未捕获异常变 50000「服务器内部错误」。
            logger.warning("code2Session 请求失败", exc_info=True)
            raise ApiError("WX_TOKEN_UNAVAILABLE") from None

        if "openid" not in data:
            # errcode 记日志便于排查（40029 = code 无效、40163 = code 已被使用），
            # 但【不外泄】—— 对用户一律是「微信登录失败，请退出小程序后重试」。
            logger.warning("code2Session 未返回 openid：errcode=%s errmsg=%s",
                           data.get("errcode"), data.get("errmsg"))
            raise ApiError("WX_CODE_INVALID")
        return data["openid"]

    async def check_text(self, text: str) -> bool:
        """内容安全检测。微信侧故障时返回 False（拒绝保存），绝不放行。"""
        settings = get_settings()
        if settings.wx_mock_login:
            return True
        try:
            token = await self._access_token()
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{_API}/wxa/msg_sec_check",
                    params={"access_token": token},
                    json={"content": text, "version": 2, "scene": 2},
                )
            return resp.json().get("errcode") == 0
        except Exception:
            logger.warning("内容安全检测失败，按拒绝处理", exc_info=True)
            return False        # 宁可用户改不了昵称，也不让违规内容进库

    # ── access_token ────────────────────────────────────────────────

    async def _access_token(self) -> str:
        """取 access_token，优先走 Redis 缓存。

        **Redis 不可用时降级为每次都取** —— 与项目里「Redis 是优化不是正确性
        依赖」的原则一致：慢一点、费一点配额，但不影响功能。
        """
        cached = await self._cached_token()
        if cached:
            return cached

        token = await self._fetch_token()
        await self._cache_token(token)
        return token

    async def _cached_token(self) -> str | None:
        client = get_redis()
        if client is None:
            return None
        try:
            return await client.get(key(_TOKEN_KEY))
        except Exception:
            logger.warning("读取 access_token 缓存失败，改为直接向微信获取")
            return None

    async def _cache_token(self, token: str) -> None:
        client = get_redis()
        if client is None:
            return
        try:
            await client.set(key(_TOKEN_KEY), token, ex=_TOKEN_TTL)
        except Exception:
            logger.warning("写入 access_token 缓存失败，本次不缓存")

    async def _fetch_token(self) -> str:
        settings = get_settings()
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(
                    f"{_API}/cgi-bin/token",
                    params={"grant_type": "client_credential",
                            "appid": settings.wx_appid, "secret": settings.wx_secret},
                )
            data = resp.json()
        except Exception:
            logger.warning("获取 access_token 请求失败", exc_info=True)
            raise ApiError("WX_TOKEN_UNAVAILABLE") from None

        token = data.get("access_token")
        if not token:
            logger.error("获取 access_token 失败：errcode=%s errmsg=%s",
                         data.get("errcode"), data.get("errmsg"))
            raise ApiError("WX_TOKEN_UNAVAILABLE")
        return token

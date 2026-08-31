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
        """内容安全检测。微信侧故障时返回 False（拒绝保存），绝不放行。"""
        settings = get_settings()
        if settings.wx_mock_login:
            return True
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    "https://api.weixin.qq.com/wxa/msg_sec_check",
                    params={"access_token": await self._access_token()},
                    json={"content": text, "version": 2, "scene": 2},
                )
            return resp.json().get("errcode") == 0
        except Exception:
            return False        # 宁可用户改不了昵称，也不让违规内容进库

    async def _access_token(self) -> str:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/cgi-bin/token",
                params={"grant_type": "client_credential",
                        "appid": settings.wx_appid, "secret": settings.wx_secret},
            )
        token = resp.json().get("access_token")
        if not token:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "WX_TOKEN_UNAVAILABLE")
        return token

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
        "kind": kind,               # access | refresh | admin，不可混用
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    # 刻意不放 openid：token 泄露不该连带泄露微信身份
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


def create_admin_token(admin_id: uuid.UUID) -> str:
    """后台 token：8 小时，无 refresh。

    长效 refresh token 存在浏览器里，对一个能改全局配置的后台是不必要的
    攻击面。管理员一天登录一次不算负担。
    """
    return _encode(admin_id, get_settings().admin_token_ttl_seconds, "admin")


async def current_admin_claims(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """管理 token 的完整载荷。

    比只返回 id 多给出 iat —— 改密后要靠它判断这张 token 是不是改密之前签发的。
    """
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "TOKEN_MISSING")
    return decode_token(cred.credentials, expect_kind="admin")


async def current_admin_id(
    claims: dict = Depends(current_admin_claims),
) -> uuid.UUID:
    return uuid.UUID(claims["sub"])

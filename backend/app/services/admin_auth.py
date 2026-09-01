"""管理员登录编排。

【隐私硬约束】本文件不得引用 NightRecord / AnalyticsEvent / decrypt_*。
tests/test_admin_privacy.py 用 AST 扫描把守。
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.password import (
    MAX_PASSWORD_BYTES, MIN_PASSWORD_LEN, hash_password, verify_password,
)
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
    """返回 (token, ttl_seconds)。任何失败都抛 ApiError。"""
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        # bcrypt 的硬上限。挡在这里，避免 hashpw 抛 ValueError 冒泡成 500。
        raise ApiError("PASSWORD_TOO_LONG")

    if not await rate_limit_ok(client_ip):
        raise ApiError("TOO_MANY_ATTEMPTS")

    admin: AdminUser | None = await admin_repo.get_admin_by_username(session, username)

    # 用户名不存在与密码错误返回完全相同的响应，不泄露账号是否存在。
    if admin is None or not verify_password(password, admin.hashed_password):
        raise ApiError("ADMIN_LOGIN_FAILED")
    if not admin.is_active:
        raise ApiError("ADMIN_INACTIVE")

    admin.last_login_at = datetime.now(timezone.utc)
    await session.flush()

    ttl = get_settings().admin_token_ttl_seconds
    return create_admin_token(admin.id), ttl


async def require_active_admin(session: AsyncSession, admin_id: uuid.UUID,
                               token_iat: int | None = None) -> AdminUser:
    """token 有效不等于账号还能用。每个管理接口都要过这一关。

    8 小时的 token 期间账号可能被删、被停用、或改过密码，此时剩余时间内必须
    立刻失效——没有 refresh 机制可以吊销，只能每次查库。
    """
    admin = await admin_repo.get_admin(session, admin_id)
    if admin is None:
        raise ApiError("ADMIN_NOT_FOUND")
    if not admin.is_active:
        raise ApiError("ADMIN_INACTIVE")

    # 改密之前签发的 token 全部作废，包括别的设备上那些。
    # 用 < 而不是 <=：token 的 iat 是取整到秒的，与 password_changed_at 落在
    # 同一秒时不该被误判为过期（改密后立刻重新登录就是这种情况）。
    if token_iat is not None and admin.password_changed_at is not None:
        changed_at = int(admin.password_changed_at.timestamp())
        if token_iat < changed_at:
            raise ApiError("PASSWORD_CHANGED")

    return admin


async def change_password(session: AsyncSession, admin: AdminUser,
                          current_password: str, new_password: str,
                          client_ip: str) -> None:
    """自助改密。只改自己的——admin 由 token 推出，调用方无法指定别人。

    必须验当前密码：否则一次 XSS、或一台没锁屏的电脑，就能把账号永久锁死。
    """
    if not await rate_limit_ok(client_ip):
        raise ApiError("TOO_MANY_ATTEMPTS")

    if len(new_password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ApiError("PASSWORD_TOO_LONG")

    if not verify_password(current_password, admin.hashed_password):
        raise ApiError("CURRENT_PASSWORD_WRONG")

    if len(new_password) < MIN_PASSWORD_LEN:
        raise ApiError("PASSWORD_TOO_SHORT")

    if verify_password(new_password, admin.hashed_password):
        raise ApiError("PASSWORD_UNCHANGED")

    admin.hashed_password = hash_password(new_password)
    # 同时作废改密之前签发的所有 token（含本次请求用的那张）
    admin.password_changed_at = datetime.now(timezone.utc)
    await session.flush()

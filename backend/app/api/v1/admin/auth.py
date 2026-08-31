import uuid

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_admin_claims
from app.schemas.admin import (
    AdminLoginRequest, AdminMeResponse, AdminPasswordChangeRequest, AdminTokenResponse,
)
from app.services import admin_auth

router = APIRouter(tags=["admin"])


async def current_admin(
    claims: dict = Depends(current_admin_claims),
    session: AsyncSession = Depends(get_session),
):
    """所有管理接口共用的依赖：token 合法 + 账号仍在、启用、且未在签发后改过密码。"""
    return await admin_auth.require_active_admin(
        session, uuid.UUID(claims["sub"]), token_iat=claims.get("iat"))


@router.post("/login", response_model=AdminTokenResponse)
async def login(payload: AdminLoginRequest, request: Request,
                session: AsyncSession = Depends(get_session)):
    client_ip = request.client.host if request.client else "unknown"
    token, ttl = await admin_auth.login(
        session, payload.username, payload.password, client_ip)
    await session.commit()
    return AdminTokenResponse(access_token=token, expires_in=ttl)


@router.get("/me", response_model=AdminMeResponse)
async def me(admin=Depends(current_admin)):
    return AdminMeResponse(username=admin.username, last_login_at=admin.last_login_at)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(payload: AdminPasswordChangeRequest, request: Request,
                          admin=Depends(current_admin),
                          session: AsyncSession = Depends(get_session)):
    """改自己的密码。

    只能改自己 —— admin 由 token 推出，请求体里没有「改谁」这个参数。
    改成功后【本次用的 token 也会失效】，前端要引导重新登录；
    别的设备上那些改密前签发的 token 同时作废。
    """
    client_ip = request.client.host if request.client else "unknown"
    await admin_auth.change_password(
        session, admin, payload.current_password, payload.new_password, client_ip)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

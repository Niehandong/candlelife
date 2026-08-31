import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.db import get_session
from app.schemas.auth import AccessToken, RefreshRequest, TokenPair, WxLoginRequest
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/wx-login", response_model=TokenPair)
async def wx_login(body: WxLoginRequest, session: AsyncSession = Depends(get_session)):
    _, access, refresh = await AuthService().login_with_code(session, body.code)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=AccessToken)
async def refresh(body: RefreshRequest):
    payload = security.decode_token(body.refresh_token, expect_kind="refresh")
    return AccessToken(access_token=security.create_access_token(uuid.UUID(payload["sub"])))

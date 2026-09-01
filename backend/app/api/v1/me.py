import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.schemas.user import MeResponse, NicknameUpdate, SettingsPayload
from app.services import user as user_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeResponse)
async def get_me(user_id: uuid.UUID = Depends(current_user_id),
                 session: AsyncSession = Depends(get_session)):
    return await user_service.get_me(session, user_id)


@router.patch("", response_model=MeResponse)
async def update_me(body: NicknameUpdate,
                    user_id: uuid.UUID = Depends(current_user_id),
                    session: AsyncSession = Depends(get_session)):
    return await user_service.update_nickname(session, user_id, body.nickname)


@router.put("/settings", response_model=SettingsPayload)
async def update_settings(body: SettingsPayload,
                          user_id: uuid.UUID = Depends(current_user_id),
                          session: AsyncSession = Depends(get_session)):
    return await user_service.update_settings(session, user_id, body)


@router.delete("")
async def delete_account(user_id: uuid.UUID = Depends(current_user_id),
                         session: AsyncSession = Depends(get_session)):
    """注销：物理删除全部数据。返回 200 + data:null。"""
    await user_service.delete_account(session, user_id)
    return None

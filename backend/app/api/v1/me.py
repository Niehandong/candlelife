import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.models import UserSettings
from app.repositories import user as user_repo
from app.schemas.user import MeResponse, NicknameUpdate, SettingsPayload
from app.services.wechat import WeChatClient

router = APIRouter(prefix="/me", tags=["me"])


def _payload(s: UserSettings) -> SettingsPayload:
    return SettingsPayload(bedtime=s.bedtime, wake_time=s.wake_time,
                           timezone=s.timezone, reduced_motion=s.reduced_motion)


def _response(user, s: UserSettings) -> MeResponse:
    return MeResponse(id=str(user.id), nickname=user.nickname,
                      avatar_url=user.avatar_url, settings=_payload(s))


async def _require(session, user_id):
    user = await user_repo.get(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND")
    return user


@router.get("", response_model=MeResponse)
async def get_me(user_id: uuid.UUID = Depends(current_user_id),
                 session: AsyncSession = Depends(get_session)):
    user = await _require(session, user_id)
    return _response(user, await session.get(UserSettings, user_id))


@router.patch("", response_model=MeResponse)
async def update_me(body: NicknameUpdate,
                    user_id: uuid.UUID = Depends(current_user_id),
                    session: AsyncSession = Depends(get_session)):
    # 微信硬性要求：昵称须过内容安全检测，检测失败一律拒绝保存
    if not await WeChatClient().check_text(body.nickname):
        raise HTTPException(422, "NICKNAME_REJECTED")
    user = await _require(session, user_id)
    user.nickname = body.nickname
    await session.commit()
    return _response(user, await session.get(UserSettings, user_id))


@router.put("/settings", response_model=SettingsPayload)
async def update_settings(body: SettingsPayload,
                          user_id: uuid.UUID = Depends(current_user_id),
                          session: AsyncSession = Depends(get_session)):
    s = await session.get(UserSettings, user_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND")
    s.bedtime, s.wake_time = body.bedtime, body.wake_time
    s.timezone, s.reduced_motion = body.timezone, body.reduced_motion
    await session.commit()
    return body


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(user_id: uuid.UUID = Depends(current_user_id),
                         session: AsyncSession = Depends(get_session)):
    """注销：物理删除全部数据，依赖 ON DELETE CASCADE。"""
    user = await user_repo.get(session, user_id)
    if user is not None:
        await session.delete(user)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

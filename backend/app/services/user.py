"""用户资料、设置与注销。

从 api/v1/me.py 搬过来的 —— 那里原本在路由里直接调外部服务（微信内容安全检测）
并提交事务。外部调用与事务边界都属于 service 层。
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import UserSettings
from app.repositories import user as user_repo
from app.schemas.user import MeResponse, SettingsPayload
from app.services.wechat import WeChatClient


def _payload(s: UserSettings) -> SettingsPayload:
    return SettingsPayload(bedtime=s.bedtime, wake_time=s.wake_time,
                           timezone=s.timezone, reduced_motion=s.reduced_motion)


async def _require_user(session: AsyncSession, user_id: uuid.UUID):
    user = await user_repo.get(session, user_id)
    if user is None:
        # 对外说「登录已失效」而不是「查无此人」—— 不暴露账号是否存在
        raise ApiError("USER_NOT_FOUND")
    return user


async def _response(session: AsyncSession, user, user_id: uuid.UUID) -> MeResponse:
    settings = await session.get(UserSettings, user_id)
    return MeResponse(id=str(user.id), nickname=user.nickname,
                      avatar_url=user.avatar_url, settings=_payload(settings))


async def get_me(session: AsyncSession, user_id: uuid.UUID) -> MeResponse:
    return await _response(session, await _require_user(session, user_id), user_id)


async def update_nickname(session: AsyncSession, user_id: uuid.UUID,
                          nickname: str) -> MeResponse:
    """改昵称。

    微信硬性要求：昵称须过内容安全检测。**检测失败一律拒绝保存** ——
    检测服务不可用时也拒绝，不能因为下游挂了就放行违规内容
    （WeChatClient.check_text 在不可用时返回 False）。
    """
    if not await WeChatClient().check_text(nickname):
        raise ApiError("NICKNAME_REJECTED")
    user = await _require_user(session, user_id)
    user.nickname = nickname
    await session.commit()
    return await _response(session, user, user_id)


async def update_settings(session: AsyncSession, user_id: uuid.UUID,
                          payload: SettingsPayload) -> SettingsPayload:
    settings = await session.get(UserSettings, user_id)
    if settings is None:
        raise ApiError("USER_NOT_FOUND")
    settings.bedtime, settings.wake_time = payload.bedtime, payload.wake_time
    settings.timezone, settings.reduced_motion = payload.timezone, payload.reduced_motion
    await session.commit()
    return payload


async def delete_account(session: AsyncSession, user_id: uuid.UUID) -> None:
    """注销：物理删除全部数据，依赖各表外键的 ON DELETE CASCADE。

    刻意做成【幂等】的：用户已不存在时静默返回而不是报错 ——
    注销请求重发一次不该给用户一个「操作失败」的提示。
    """
    user = await user_repo.get(session, user_id)
    if user is not None:
        await session.delete(user)
        await session.commit()

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.repositories import user as user_repo
from app.services.wechat import WeChatClient


class AuthService:
    def __init__(self, wechat: WeChatClient | None = None):
        self.wechat = wechat or WeChatClient()

    async def login_with_code(self, session: AsyncSession, code: str):
        openid = await self.wechat.code_to_session(code)
        user = await user_repo.get_by_openid(session, openid)
        if user is None:
            user = await user_repo.create_with_defaults(session, openid)
        await session.commit()
        return (user,
                security.create_access_token(user.id),
                security.create_refresh_token(user.id))

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserSettings


async def get_by_openid(session: AsyncSession, openid: str) -> User | None:
    return await session.scalar(select(User).where(User.openid == openid))


async def create_with_defaults(session: AsyncSession, openid: str) -> User:
    user = User(openid=openid)
    session.add(user)
    await session.flush()
    session.add(UserSettings(user_id=user.id))
    await session.flush()
    return user


async def get(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)

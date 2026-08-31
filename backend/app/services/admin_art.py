"""后台的作品管理。

【隐私硬约束】本文件不得引用 NightRecord / AnalyticsEvent / decrypt_*。
统计「被收藏次数」只数 rewards 的行数，不读任何用户内容。
"""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.assets import asset_url
from app.models import ArtWork
from app.repositories import art as art_repo
from app.schemas.admin import AdminArtCreate, AdminArtItem, AdminArtUpdate


def _status(art: ArtWork) -> str:
    if art.is_withdrawn:
        return "withdrawn"
    return "active" if art.is_active else "inactive"


def to_item(art: ArtWork, reward_count: int) -> AdminArtItem:
    return AdminArtItem(
        id=art.id, title=art.title, artist=art.artist, year=art.year,
        thumbnail=art.thumbnail, image=art.image, alt=art.alt,
        source=art.source, article=art.article,
        is_active=art.is_active, is_withdrawn=art.is_withdrawn,
        status=_status(art),
        thumbnail_url=asset_url(art.thumbnail), image_url=asset_url(art.image),
        reward_count=reward_count)


async def get_or_404(session: AsyncSession, art_id: str) -> ArtWork:
    art = await session.get(ArtWork, art_id)
    if art is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ART_NOT_FOUND")
    return art


async def create(session: AsyncSession, payload: AdminArtCreate) -> ArtWork:
    if await session.get(ArtWork, payload.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_ID_TAKEN")
    art = ArtWork(**payload.model_dump())
    session.add(art)
    try:
        await session.flush()
    except IntegrityError as exc:
        # 并发下两个管理员填了同一个 slug；唯一约束是最终防线
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_ID_TAKEN") from exc
    return art


async def update(session: AsyncSession, art_id: str, payload: AdminArtUpdate) -> ArtWork:
    art = await get_or_404(session, art_id)
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(art, field_name, value)
    await session.flush()
    return art


async def delete(session: AsyncSession, art_id: str) -> None:
    """物理删除。被收藏过的作品删不掉——这是数据库层的保证，不是应用层的检查。

    先数一遍 rewards 只为给出快速、可读的错误；真正的防线是外键
    ON DELETE RESTRICT。两个管理员同时操作时，check-then-act 会漏，
    所以底下还要接住 IntegrityError。
    """
    art = await get_or_404(session, art_id)
    if await art_repo.count_rewards_for(session, art_id) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_IN_USE")
    await session.delete(art)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "ART_IN_USE") from exc

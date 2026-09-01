"""收藏与作品详情。

从 api/v1/art.py 搬过来的 —— 那里原本直接在路由里跑 domain 判定、循环查库、
组装响应模型，违反了「api/v1 只做出入参转换与依赖注入」这条分层约定。
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.assets import art_brief
from app.core.errors import ApiError
from app.domain import ritual as domain
from app.models import ArtWork
from app.repositories import art as art_repo
from app.repositories import reward as reward_repo
from app.schemas.art import ArtDetail, CollectionItem, CollectionResponse


async def collection_for(session: AsyncSession,
                         user_id: uuid.UUID) -> CollectionResponse:
    """用户的收藏册。

    统计口径与展示口径【刻意不同】：撤回的作品从展示中隐去，但仍计入
    total_cards / unique_works —— 用户拿到过的东西不该因为下架而凭空消失，
    否则收藏数会莫名其妙变少。summarize_collection 在 domain 层算统计，
    这里只负责把还能展示的那些取出来。
    """
    art_ids = await reward_repo.list_art_ids(session, user_id)
    summary = domain.summarize_collection(art_ids)

    # 一次批量取，不是每条查一次（原来是 N+1）
    visible = await art_repo.get_visible_many(session, list(summary.counts))
    items = [CollectionItem(art=art_brief(visible[art_id]), count=count)
             for art_id, count in summary.counts.items()
             if art_id in visible]

    return CollectionResponse(total_cards=summary.total_cards,
                              unique_works=summary.unique_works, items=items)


async def art_detail(session: AsyncSession, art_id: str) -> ArtDetail:
    art: ArtWork | None = await session.get(ArtWork, art_id)
    if art is None:
        raise ApiError("ART_NOT_FOUND")
    if art.is_withdrawn:
        # 与「找不到」分开：用户可能收藏过它，需要一句「已撤回」而不是「不存在」
        raise ApiError("ART_WITHDRAWN")
    return ArtDetail(**art_brief(art).model_dump(),
                     source=art.source, article=art.article)

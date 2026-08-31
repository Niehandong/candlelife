import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.assets import art_brief
from app.core.db import get_session
from app.core.security import current_user_id
from app.domain import ritual as domain
from app.models import ArtWork
from app.repositories import art as art_repo
from app.repositories import reward as reward_repo
from app.schemas.reward import ArtDetail, CollectionItem, CollectionResponse

router = APIRouter(tags=["art"])


@router.get("/collection", response_model=CollectionResponse)
async def collection(user_id: uuid.UUID = Depends(current_user_id),
                     session: AsyncSession = Depends(get_session)):
    art_ids = await reward_repo.list_art_ids(session, user_id)
    summary = domain.summarize_collection(art_ids)

    items = []
    for art_id, count in summary.counts.items():
        art = await art_repo.get_visible(session, art_id)
        if art is not None:            # 撤回的作品从展示中隐去，但仍计入统计
            items.append(CollectionItem(art=art_brief(art), count=count))
    return CollectionResponse(total_cards=summary.total_cards,
                              unique_works=summary.unique_works, items=items)


@router.get("/art/{art_id}", response_model=ArtDetail)
async def art_detail(art_id: str, _: uuid.UUID = Depends(current_user_id),
                     session: AsyncSession = Depends(get_session)):
    art: ArtWork | None = await session.get(ArtWork, art_id)
    if art is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ART_NOT_FOUND")
    if art.is_withdrawn:
        raise HTTPException(status.HTTP_410_GONE, "ART_WITHDRAWN")
    return ArtDetail(**art_brief(art).model_dump(), source=art.source, article=art.article)

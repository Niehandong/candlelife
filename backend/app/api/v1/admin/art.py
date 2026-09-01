from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.auth import current_admin
from app.core.db import get_session
from app.repositories import art as art_repo
from app.schemas.admin import (
    AdminArtCreate, AdminArtItem, AdminArtListResponse, AdminArtUpdate,
)
from app.services import admin_art

router = APIRouter(tags=["admin"])


@router.get("/art", response_model=AdminArtListResponse)
async def list_art(status_filter: str | None = Query(None, alias="status"),
                   q: str | None = Query(None, max_length=64),
                   page: int = Query(1, ge=1),
                   page_size: int = Query(20, ge=1, le=200),
                   _=Depends(current_admin),
                   session: AsyncSession = Depends(get_session)):
    """分页返回。total 是筛选后的总数，不是本页条数。

    翻过最后一页给空列表而不是 404 —— 删掉最后一页的作品后，前端可能正停在
    那一页，报错会让界面卡死在一个回不去的状态。
    """
    total = await art_repo.count_for_admin(session, status_filter, q)
    works = await art_repo.list_for_admin(
        session, status_filter, q, limit=page_size, offset=(page - 1) * page_size)

    # 一次查出本页所有作品的收藏数，而不是每条查一次
    counts = await art_repo.reward_counts_for(session, [a.id for a in works])
    items = [admin_art.to_item(a, counts.get(a.id, 0)) for a in works]

    return AdminArtListResponse(
        items=items, total=total, page=page, page_size=page_size,
        pages=-(-total // page_size) if total else 0)


@router.post("/art", response_model=AdminArtItem)
async def create_art(payload: AdminArtCreate, _=Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    art = await admin_art.create(session, payload)
    await session.commit()
    return admin_art.to_item(art, 0)


@router.patch("/art/{art_id}", response_model=AdminArtItem)
async def update_art(art_id: str, payload: AdminArtUpdate, _=Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    art = await admin_art.update(session, art_id, payload)
    count = await art_repo.count_rewards_for(session, art_id)
    await session.commit()
    return admin_art.to_item(art, count)


@router.delete("/art/{art_id}")
async def delete_art(art_id: str, _=Depends(current_admin),
                     session: AsyncSession = Depends(get_session)):
    await admin_art.delete(session, art_id)
    await session.commit()
    return None

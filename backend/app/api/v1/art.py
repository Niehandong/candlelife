import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import current_user_id
from app.schemas.art import ArtDetail, CollectionResponse
from app.services import collection as collection_service

router = APIRouter(tags=["art"])


@router.get("/collection", response_model=CollectionResponse)
async def collection(user_id: uuid.UUID = Depends(current_user_id),
                     session: AsyncSession = Depends(get_session)):
    return await collection_service.collection_for(session, user_id)


@router.get("/art/{art_id}", response_model=ArtDetail)
async def art_detail(art_id: str, _: uuid.UUID = Depends(current_user_id),
                     session: AsyncSession = Depends(get_session)):
    return await collection_service.art_detail(session, art_id)

from datetime import date, datetime

from pydantic import BaseModel


class ArtBrief(BaseModel):
    id: str
    title: str
    artist: str
    year: str
    thumbnail: str          # 已拼 ASSET_BASE_URL
    image: str
    alt: str


class ArtDetail(ArtBrief):
    source: str
    article: str


class RewardItem(BaseModel):
    art: ArtBrief
    ritual_date: date
    awarded_at: datetime


class PendingResponse(BaseModel):
    revealable: bool
    ritual_dates: list[date]


class RevealResponse(BaseModel):
    rewards: list[RewardItem]


class CollectionItem(BaseModel):
    art: ArtBrief
    count: int


class CollectionResponse(BaseModel):
    total_cards: int
    unique_works: int
    items: list[CollectionItem]

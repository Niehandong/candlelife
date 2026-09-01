"""艺术作品与收藏册的对外模型。

从 schemas/reward.py 拆出来的 —— 那个文件名说的是「奖励」，里面却装着
作品与收藏册的四个模型，找东西时会先找错地方。奖励（RewardItem /
PendingResponse / RevealResponse）留在 reward.py，这里只放作品本身。
"""
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


class CollectionItem(BaseModel):
    art: ArtBrief
    count: int


class CollectionResponse(BaseModel):
    total_cards: int
    unique_works: int
    items: list[CollectionItem]

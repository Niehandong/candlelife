"""奖励的对外模型。

作品本身与收藏册的模型在 schemas/art.py —— 这里只放「什么时候发了什么奖」。
"""
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.art import ArtBrief


class RewardItem(BaseModel):
    art: ArtBrief
    ritual_date: date
    awarded_at: datetime


class PendingResponse(BaseModel):
    revealable: bool
    ritual_dates: list[date]


class RevealResponse(BaseModel):
    rewards: list[RewardItem]

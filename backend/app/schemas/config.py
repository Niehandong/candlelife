from datetime import datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

# 与 core/errors.py 的 SENSITIVE_KEYS 对齐：这些键绝不可出现在匿名事件里
FORBIDDEN_PAYLOAD_KEYS = {"gratitudes", "plans", "openid", "session_key",
                          "nickname", "avatar_url", "text", "content",
                          "access_token", "refresh_token"}


class SchedulePayload(BaseModel):
    bedtime: time
    wake_time: time
    min_time: time
    max_time: time

    @field_serializer("bedtime", "wake_time", "min_time", "max_time")
    def _hhmm(self, v: time) -> str:
        return v.strftime("%H:%M")


class RitualPayload(BaseModel):
    tolerance_minutes: int
    gratitude_count: int
    plan_count: int
    resistance_options: list[str]


class AssetsPayload(BaseModel):
    base_url: str


class ConfigResponse(BaseModel):
    schedule: SchedulePayload
    ritual: RitualPayload
    assets: AssetsPayload


class EventItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime

    @field_validator("payload")
    @classmethod
    def _no_private_text(cls, v: dict) -> dict:
        leaked = FORBIDDEN_PAYLOAD_KEYS & set(v)
        if leaked:
            raise ValueError(f"匿名事件不得包含私人内容字段：{sorted(leaked)}")
        return v


class EventBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[EventItem] = Field(min_length=1, max_length=200)

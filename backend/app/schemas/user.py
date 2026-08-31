from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


class SettingsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bedtime: time
    wake_time: time
    timezone: str
    reduced_motion: bool

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError, KeyError) as exc:
            raise ValueError(f"未知时区：{v}") from exc
        return v

    @field_serializer("bedtime", "wake_time")
    def _hhmm(self, v: time) -> str:
        return v.strftime("%H:%M")


class NicknameUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nickname: str = Field(min_length=1, max_length=32)


class MeResponse(BaseModel):
    id: str
    nickname: str | None
    avatar_url: str | None
    settings: SettingsPayload

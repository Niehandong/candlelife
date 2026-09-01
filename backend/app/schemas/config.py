from datetime import time

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


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

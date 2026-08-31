from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CompleteRequest(BaseModel):
    # forbid：客户端若尝试传 is_eligible / streak 等判定字段，直接 422。
    # 拒绝比静默忽略安全——客户端能立刻发现自己传错了。
    model_config = ConfigDict(extra="forbid")

    completed_at: datetime
    gratitudes: list[str] = Field(default_factory=list, max_length=10)
    plans: list[str] = Field(default_factory=list, max_length=10)
    resistance_reason: str | None = Field(default=None, max_length=128)


class CompleteResponse(BaseModel):
    ritual_date: date
    is_eligible: bool
    late_minutes: int
    streak: int


class NightSummary(BaseModel):
    ritual_date: date
    is_eligible: bool
    late_minutes: int
    completed_at: datetime


class NightList(BaseModel):
    items: list[NightSummary]


class NightDetail(NightSummary):
    gratitudes: list[str]
    plans: list[str]
    resistance_reason: str | None
    text_available: bool          # 解密失败时为 False，元数据仍照常返回


class RecordTextUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gratitudes: list[str] = Field(default_factory=list, max_length=10)
    plans: list[str] = Field(default_factory=list, max_length=10)

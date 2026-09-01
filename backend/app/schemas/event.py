"""匿名行为事件的对外模型。

从 schemas/config.py 拆出来的 —— 事件与运营配置是两回事，
挤在同一个文件里只会让人先找错地方。
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# 与 core/errors.py 的 SENSITIVE_KEYS 对齐：这些键绝不可出现在匿名事件里。
# 这是一道【入口】防线：夜记正文在库里是加密的，若因为某次前端改动被塞进
# 事件 payload，就等于在分析表里留下一份明文副本。
FORBIDDEN_PAYLOAD_KEYS = {"gratitudes", "plans", "openid", "session_key",
                          "nickname", "avatar_url", "text", "content",
                          "access_token", "refresh_token"}


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

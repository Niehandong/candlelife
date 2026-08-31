from pydantic import BaseModel, ConfigDict, Field


class WxLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class AccessToken(BaseModel):
    access_token: str

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.password import MAX_PASSWORD_BYTES, MIN_PASSWORD_LEN


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64)
    # 上限按字节算才准（中文一字 3 字节），字符上限只是第一道闸；
    # 真正的字节校验在 service 里，超限返回 422 而非 500。
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_BYTES)


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AdminMeResponse(BaseModel):
    username: str
    last_login_at: datetime | None


class AdminPasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 必须验当前密码 —— 否则一次 XSS、或一台没锁屏的电脑就能把账号永久锁死
    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_BYTES)
    # 下限读 core/password.py 的 MIN_PASSWORD_LEN（当前 1 = 不限制）；
    # 上限是 bcrypt 的 72 字节（中文一字 3 字节，即 24 个汉字），
    # 字节级校验在 service 里
    new_password: str = Field(min_length=MIN_PASSWORD_LEN,
                              max_length=MAX_PASSWORD_BYTES)


# ---------------------------------------------------------------- 运营配置

# 所有文案字段共用的约束。200 字是小程序单屏能读完的上限。
Copy = Field(min_length=1, max_length=200)
HHMM = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

# extra="forbid"：字段名打错必须报错。静默丢弃会让管理员以为保存成功了，
# 而配置直接驱动用户可见的判定，「以为保存了其实没有」是最坏的一类错。
_Strict = ConfigDict(extra="forbid")


class AppSection(BaseModel):
    model_config = _Strict
    name: str = Copy
    slogan: str = Copy
    home_question: str = Copy
    skip_tonight_enabled: bool
    onboarding_enabled: bool
    reduce_motion_default: bool
    anonymous_analytics_enabled: bool


class ScheduleSection(BaseModel):
    model_config = _Strict
    bedtime: str = HHMM
    wake_time: str = HHMM
    min_time: str = HHMM
    max_time: str = HHMM

    @model_validator(mode="after")
    def _window_not_empty(self):
        if self.min_time == self.max_time:
            raise ValueError(
                "资格窗口的上下界不得相同——窗口宽度为零意味着所有用户永远不合格")
        return self


class OnboardingSection(BaseModel):
    model_config = _Strict
    welcome_title: str = Copy
    guest_copy: str = Copy
    guide_rest: str = Copy
    guide_light: str = Copy
    guide_gift: str = Copy
    story_video_path: str = Field(min_length=1, max_length=256)
    story_poster: str = Field(min_length=1, max_length=256)
    story_status: str = Copy
    skip_story_enabled: bool


class RitualSection(BaseModel):
    model_config = _Strict
    tolerance_minutes: int = Field(ge=0, le=180)
    gratitude_count: int = Field(ge=1, le=5)
    plan_count: int = Field(ge=1, le=5)
    resistance_options: list[str] = Field(min_length=1, max_length=8)
    ritual_minutes: int = Field(ge=1, le=180)
    dim_minutes: int = Field(ge=0, le=60)
    goodnight_text: str = Copy
    interrupt_text: str = Copy
    resistance_reply: str = Copy
    stage_not_started_enabled: bool
    stage_wind_down_enabled: bool
    stage_quieting_enabled: bool
    stage_done_enabled: bool

    @field_validator("resistance_options")
    @classmethod
    def _options_nonblank(cls, v: list[str]) -> list[str]:
        for item in v:
            if not item.strip():
                raise ValueError("阻力选项不得为空白")
            if len(item) > 32:
                raise ValueError(f"阻力选项不得超过 32 字：{item[:10]}…")
        return v


class RecordsSection(BaseModel):
    model_config = _Strict
    journal_days: int = Field(ge=1, le=365)
    journal_empty_copy: str = Copy
    comparison_copy: str = Copy
    collection_limit: int = Field(ge=1, le=500)
    reward_timing: Literal["next-day", "immediate"]
    reward_copy: str = Copy
    collection_empty_copy: str = Copy
    random_art_enabled: bool
    image_fallback_enabled: bool


class AdminConfigPayload(BaseModel):
    model_config = _Strict
    app: AppSection
    schedule: ScheduleSection
    onboarding: OnboardingSection
    ritual: RitualSection
    records: RecordsSection


class ConfigChangeItem(BaseModel):
    # 用 from_/to 而非 old/new：spec 的接口示例写的是 from/to，
    # from 是 Python 关键字，靠 alias 输出正确的 JSON 字段名。
    model_config = ConfigDict(populate_by_name=True)

    path: str
    from_: object = Field(alias="from")
    to: object


class ConfigFieldError(BaseModel):
    field: str
    message: str


class ConfigDiffResponse(BaseModel):
    changes: list[ConfigChangeItem]
    valid: bool
    errors: list[ConfigFieldError]


class AdminConfigResponse(BaseModel):
    # 用 AdminConfigPayload 而不是 dict：响应确实就是这个形状，用 dict 等于
    # 让 OpenAPI 完全不描述它，前端的契约测试也就无从比对。
    config: AdminConfigPayload
    updated_by: str | None
    updated_at: datetime | None


# ---------------------------------------------------------------- 艺术作品

NonBlank = Field(min_length=1, max_length=256)


def _reject_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("不得为空白")
    return v


class AdminArtCreate(BaseModel):
    model_config = _Strict

    # slug 手填：它是抽卡与收藏的稳定标识，自动生成会在改标题时漂移。
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = NonBlank
    artist: str = NonBlank
    year: str = Field(min_length=1, max_length=64)
    thumbnail: str = NonBlank
    image: str = NonBlank
    alt: str = NonBlank
    source: str = Field(min_length=1, max_length=2000)
    article: str = Field(min_length=1, max_length=20000)

    _nonblank = field_validator("title", "artist", "year", "thumbnail", "image",
                                "alt", "source", "article")(_reject_blank)


class AdminArtUpdate(BaseModel):
    model_config = _Strict

    title: str | None = Field(default=None, min_length=1, max_length=256)
    artist: str | None = Field(default=None, min_length=1, max_length=256)
    year: str | None = Field(default=None, min_length=1, max_length=64)
    thumbnail: str | None = Field(default=None, min_length=1, max_length=256)
    image: str | None = Field(default=None, min_length=1, max_length=256)
    alt: str | None = Field(default=None, min_length=1, max_length=256)
    source: str | None = Field(default=None, min_length=1, max_length=2000)
    article: str | None = Field(default=None, min_length=1, max_length=20000)
    is_active: bool | None = None
    is_withdrawn: bool | None = None

    @field_validator("title", "artist", "year", "thumbnail", "image", "alt",
                     "source", "article")
    @classmethod
    def _no_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("不得为空白")
        return v


class AdminArtItem(BaseModel):
    id: str
    title: str
    artist: str
    year: str
    thumbnail: str          # 原始相对路径，编辑表单要回填这个
    image: str
    alt: str
    source: str
    article: str
    is_active: bool
    is_withdrawn: bool
    status: Literal["active", "inactive", "withdrawn"]
    thumbnail_url: str      # 拼好 ASSET_BASE_URL 的完整地址，列表缩略图用
    image_url: str
    reward_count: int       # 被收藏次数；>0 时前端禁用删除按钮


class AdminArtListResponse(BaseModel):
    items: list[AdminArtItem]
    total: int          # 符合筛选条件的总数，不是本页条数
    page: int           # 当前页码，从 1 开始
    page_size: int
    pages: int          # 总页数；total 为 0 时是 0

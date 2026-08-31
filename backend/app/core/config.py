from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"

    database_url: str
    # 生产库 eastern 的 public schema 已被其他项目占用（含同名 users 表），
    # 本项目全部对象隔离在独立 schema 中，通过连接级 search_path 切换。
    db_schema: str = "zhusheng"

    redis_host: str
    redis_port: int = 6379
    redis_db: int = 1
    redis_password: str = ""
    redis_prefix: str = "zhusheng:"

    fernet_keys: str          # 逗号分隔，第一个为主密钥
    jwt_secret: str
    access_token_ttl_seconds: int = 2 * 60 * 60
    refresh_token_ttl_seconds: int = 30 * 24 * 60 * 60
    admin_token_ttl_seconds: int = 8 * 60 * 60      # 后台 8 小时，无 refresh
    admin_login_max_per_minute: int = 5             # 同一 IP 每分钟登录尝试上限
    # 空 = 不开 CORS（默认假定 admin 与 API 同源，由 Nginx 反代 /api）。
    # 分域名部署时填逗号分隔的源，如 "https://admin.example.com"。
    admin_cors_origins: str = ""

    wx_appid: str = ""
    wx_secret: str = ""
    wx_mock_login: bool = False

    asset_base_url: str

    @model_validator(mode="after")
    def _guard_production(self):
        if self.env == "production":
            if self.wx_mock_login:
                raise ValueError(
                    "WX_MOCK_LOGIN 不得在 production 开启：任何人可伪造 code 登录任意账号"
                )
            if not self.wx_appid or not self.wx_secret:
                raise ValueError("production 必须配置 WX_APPID 与 WX_SECRET")
        if not self.fernet_keys.strip():
            raise ValueError("FERNET_KEYS 不得为空；丢失密钥将导致历史正文永久不可读")
        return self

    @property
    def fernet_key_list(self) -> list[str]:
        return [k.strip() for k in self.fernet_keys.split(",") if k.strip()]

    @property
    def admin_cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.admin_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

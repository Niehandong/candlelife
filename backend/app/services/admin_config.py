"""运营配置的读写编排。

【隐私硬约束】本文件不得引用 NightRecord / AnalyticsEvent / decrypt_*。

【坏数据必须降级】库里的 JSON 无论多离谱，公开的 GET /config 都必须能返回
一份可用的配置。小程序启动就要读它，让它 500 等于让所有用户开不了 App。
"""

import logging

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis, key
from app.domain.config import (
    DEFAULT_CONFIG, ConfigChange, RuntimeConfig, config_from_dict, config_to_dict,
    diff_config,
)
from app.models import AppConfig
from app.repositories import admin as admin_repo
from app.schemas.admin import AdminConfigPayload

logger = logging.getLogger("zhusheng")

CACHE_KEY_PARTS = ("config", "active")


async def load_active_config(session: AsyncSession) -> RuntimeConfig:
    """当前生效配置。查库优先，任何异常都回落 DEFAULT_CONFIG。"""
    try:
        row = await admin_repo.get_app_config(session)
    except Exception:
        logger.warning("读取 app_config 失败，回落默认配置", exc_info=True)
        return DEFAULT_CONFIG
    if row is None:
        return DEFAULT_CONFIG
    try:
        return config_from_dict(row.data)
    except (ValueError, TypeError):
        # 库里的 JSON 坏了。记日志，但绝不让小程序开不了机。
        logger.error("app_config.data 无法解析，回落默认配置", exc_info=True)
        return DEFAULT_CONFIG


async def current_dict(session: AsyncSession) -> dict:
    return config_to_dict(await load_active_config(session))


def validate(raw: dict) -> tuple[dict | None, list[dict]]:
    """返回 (规范化后的 dict 或 None, 逐字段错误)。"""
    try:
        payload = AdminConfigPayload.model_validate(raw)
    except ValidationError as exc:
        errors = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
                  for e in exc.errors()]
        return None, errors
    return payload.model_dump(), []


async def preview(session: AsyncSession,
                  raw: dict) -> tuple[list[ConfigChange], list[dict]]:
    """dry-run：不写库，返回 (变动项, 错误项)。校验不过时变动项为空。"""
    normalized, errors = validate(raw)
    if normalized is None:
        return [], errors
    return diff_config(await current_dict(session), normalized), []


async def save(session: AsyncSession, raw: dict, username: str) -> AppConfig:
    """保存。调用方须保证 raw 已通过 AdminConfigPayload 校验。"""
    row = await admin_repo.upsert_app_config(session, raw, username)
    await invalidate_cache()
    return row


async def invalidate_cache() -> None:
    """保存即生效：删缓存，下一次 GET /config 重新查库。

    Redis 不可用时什么都不做——缓存本就没生效，正确性不受影响。
    """
    client = get_redis()
    if client is None:
        return
    try:
        await client.delete(key(*CACHE_KEY_PARTS))
    except Exception:
        logger.warning("配置缓存失效失败，Redis 可能不可用")

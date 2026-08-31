"""Redis 客户端。

Redis 是优化，不是正确性依赖：完成仪式的幂等由 UNIQUE(user_id, ritual_date) 保证，
揭晓的幂等由 SELECT ... FOR UPDATE 保证。Redis 整体不可用时服务应变慢但不出错，
因此所有取用点都必须能接受 None。
"""

import logging

from redis.asyncio import Redis

from app.core.config import get_settings

logger = logging.getLogger("zhusheng")
_client: Redis | None = None


def get_redis() -> Redis | None:
    global _client
    if _client is None:
        s = get_settings()
        try:
            _client = Redis(
                host=s.redis_host, port=s.redis_port, db=s.redis_db,
                password=s.redis_password or None, decode_responses=True,
                socket_connect_timeout=2, socket_timeout=2)
        except Exception:
            logger.warning("Redis 初始化失败，降级运行")
            return None
    return _client


def reset_client() -> None:
    global _client
    _client = None


def key(*parts: str) -> str:
    """统一前缀，避免与同一 REDIS_DB 中其他项目撞 key。"""
    return get_settings().redis_prefix + ":".join(parts)


async def ping() -> bool:
    client = get_redis()
    if client is None:
        return False
    try:
        return bool(await client.ping())
    except Exception:
        return False

"""夜记正文的应用层加密。

使用 MultiFernet：首个密钥加密，解密时依次尝试全部密钥，
支持在不停机、不批量重加密的前提下轮换密钥。

警告：FERNET_KEYS 丢失将导致所有历史正文永久不可读，无后门。
"""

import json

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import get_settings


class DecryptError(Exception):
    """密文损坏、被篡改，或当前密钥集无法解开。"""


_cache: MultiFernet | None = None


def _build_fernet() -> MultiFernet:
    return MultiFernet([Fernet(k) for k in get_settings().fernet_key_list])


def _fernet() -> MultiFernet:
    global _cache
    if _cache is None:
        _cache = _build_fernet()
    return _cache


def reset_cache() -> None:
    """仅供测试轮换密钥时使用。"""
    global _cache
    _cache = None


def encrypt_text(plain: str | None) -> bytes | None:
    if plain is None:
        return None
    return _fernet().encrypt(plain.encode("utf-8"))


def decrypt_text(blob: bytes | None) -> str | None:
    if blob is None:
        return None
    try:
        return _fernet().decrypt(bytes(blob)).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise DecryptError("正文解密失败") from exc


def encrypt_list(values: list[str] | None) -> bytes | None:
    if not values:
        return None
    return encrypt_text(json.dumps(values, ensure_ascii=False))


def decrypt_list(blob: bytes | None) -> list[str]:
    if blob is None:
        return []
    return json.loads(decrypt_text(blob))

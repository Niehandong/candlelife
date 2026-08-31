import pytest
from cryptography.fernet import Fernet, MultiFernet

from app.core import crypto


@pytest.fixture(autouse=True)
def _clean_cache():
    crypto.reset_cache()
    yield
    crypto.reset_cache()


def test_roundtrip_text():
    blob = crypto.encrypt_text("感谢今天的阳光")
    assert blob is not None
    assert "感谢今天的阳光".encode() not in blob      # 密文中不含明文
    assert crypto.decrypt_text(blob) == "感谢今天的阳光"


def test_roundtrip_list():
    values = ["感谢今天的阳光", "感谢一顿好饭", "感谢准时下班"]
    assert crypto.decrypt_list(crypto.encrypt_list(values)) == values


def test_none_and_empty_passthrough():
    assert crypto.encrypt_text(None) is None
    assert crypto.decrypt_text(None) is None
    assert crypto.encrypt_list([]) is None
    assert crypto.encrypt_list(None) is None
    assert crypto.decrypt_list(None) == []


def test_ciphertext_differs_each_time():
    """Fernet 自带随机 IV，同一明文两次加密结果不同。"""
    assert crypto.encrypt_text("同样的话") != crypto.encrypt_text("同样的话")


def test_key_rotation_keeps_old_data_readable(monkeypatch):
    """新密钥插到最前后，旧密钥加密的数据仍可解密。"""
    old_key, new_key = Fernet.generate_key().decode(), Fernet.generate_key().decode()

    monkeypatch.setattr(crypto, "_build_fernet", lambda: MultiFernet([Fernet(old_key)]))
    crypto.reset_cache()
    blob = crypto.encrypt_text("轮换前写下的内容")

    monkeypatch.setattr(crypto, "_build_fernet",
                        lambda: MultiFernet([Fernet(new_key), Fernet(old_key)]))
    crypto.reset_cache()
    assert crypto.decrypt_text(blob) == "轮换前写下的内容"

    # 轮换后新写入的内容用新密钥
    fresh = crypto.encrypt_text("轮换后的内容")
    monkeypatch.setattr(crypto, "_build_fernet", lambda: MultiFernet([Fernet(new_key)]))
    crypto.reset_cache()
    assert crypto.decrypt_text(fresh) == "轮换后的内容"


def test_key_removed_makes_data_unreadable(monkeypatch):
    """密钥从集合中移除后，旧数据不可读——这是加密的本意，也是风险。"""
    old_key, other = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    monkeypatch.setattr(crypto, "_build_fernet", lambda: MultiFernet([Fernet(old_key)]))
    crypto.reset_cache()
    blob = crypto.encrypt_text("将要读不出来的内容")

    monkeypatch.setattr(crypto, "_build_fernet", lambda: MultiFernet([Fernet(other)]))
    crypto.reset_cache()
    with pytest.raises(crypto.DecryptError):
        crypto.decrypt_text(blob)


def test_tampered_ciphertext_raises():
    blob = bytearray(crypto.encrypt_text("原文"))
    blob[-1] ^= 0xFF
    with pytest.raises(crypto.DecryptError):
        crypto.decrypt_text(bytes(blob))

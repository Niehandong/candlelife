"""密码哈希与管理员 token。不依赖数据库。"""
import uuid

import pytest
from app.core.errors import ApiError
from app.core.password import MAX_PASSWORD_BYTES, hash_password, verify_password
from app.core.security import create_access_token, create_admin_token, decode_token


def test_hash_is_not_plaintext_and_is_salted():
    h1 = hash_password("correct horse")
    h2 = hash_password("correct horse")
    assert "correct horse" not in h1
    assert h1 != h2, "同一密码两次哈希必须不同——否则说明没加盐"
    assert h1.startswith("$2b$")


def test_verify_accepts_right_and_rejects_wrong():
    h = hash_password("correct horse")
    assert verify_password("correct horse", h) is True
    assert verify_password("wrong horse", h) is False
    assert verify_password("", h) is False


def test_verify_returns_false_on_corrupt_hash():
    """库里存了坏值时必须判为失败，不能把 ValueError 抛成 500。"""
    assert verify_password("anything", "not-a-bcrypt-hash") is False
    assert verify_password("anything", "") is False


def test_hash_rejects_password_over_72_bytes():
    """bcrypt 的硬上限。中文一字 3 字节，24 个汉字就到顶。"""
    assert MAX_PASSWORD_BYTES == 72
    with pytest.raises(ValueError):
        hash_password("x" * 73)
    with pytest.raises(ValueError):
        hash_password("密" * 25)          # 75 字节


def test_hash_accepts_exactly_72_bytes():
    assert hash_password("x" * 72).startswith("$2b$")


def test_admin_token_has_admin_kind():
    admin_id = uuid.uuid4()
    token = create_admin_token(admin_id)
    payload = decode_token(token, expect_kind="admin")
    assert payload["sub"] == str(admin_id)
    assert payload["kind"] == "admin"


def test_user_token_cannot_pass_as_admin():
    """两套 token 完全隔离：用户 token 打管理接口必须打不通。"""
    token = create_access_token(uuid.uuid4())
    with pytest.raises(ApiError) as exc:
        decode_token(token, expect_kind="admin")
    assert exc.value.code == "TOKEN_KIND_MISMATCH"
    # ApiError 自身仍带着由码推导出的真实状态（40103 // 100），
    # 「一律 200」是出口处的呈现决定，不是把这个信息抹掉。
    assert exc.value.status_code == 401


def test_admin_token_cannot_pass_as_user():
    token = create_admin_token(uuid.uuid4())
    with pytest.raises(ApiError) as exc:
        decode_token(token, expect_kind="access")
    assert exc.value.code == "TOKEN_KIND_MISMATCH"


def test_admin_token_carries_no_username():
    """token 泄露不该连带泄露账号名——与阶段一「不放 openid」同理。"""
    token = create_admin_token(uuid.uuid4())
    payload = decode_token(token, expect_kind="admin")
    assert set(payload) == {"sub", "kind", "iat", "exp", "jti"}

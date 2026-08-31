import uuid

from sqlalchemy import func, select

from app.core import security
from app.models import User, UserSettings


async def test_mock_login_creates_user_and_settings(client, session):
    r = await client.post("/api/v1/auth/wx-login", json={"code": "abc"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["refresh_token"]

    user = await session.scalar(select(User).where(User.openid == "mock_openid_abc"))
    assert user is not None
    s = await session.get(UserSettings, user.id)
    assert s is not None
    assert str(s.bedtime) == "23:30:00"
    assert s.timezone == "Asia/Shanghai"      # 默认设置随账号建立


async def test_login_twice_reuses_same_user(client, session):
    await client.post("/api/v1/auth/wx-login", json={"code": "same"})
    await client.post("/api/v1/auth/wx-login", json={"code": "same"})
    count = await session.scalar(
        select(func.count()).select_from(User).where(User.openid == "mock_openid_same"))
    assert count == 1


def test_jwt_payload_excludes_openid():
    """token 泄露不应连带泄露微信身份。"""
    payload = security.decode_token(security.create_access_token(uuid.uuid4()))
    assert "openid" not in payload
    assert {"sub", "exp", "kind", "jti"} <= set(payload)


async def test_refresh_returns_new_access_token(client):
    refresh = (await client.post(
        "/api/v1/auth/wx-login", json={"code": "ref"})).json()["refresh_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200 and r.json()["access_token"]


async def test_access_token_rejected_as_refresh(client):
    """access 与 refresh 不可混用。"""
    access = (await client.post(
        "/api/v1/auth/wx-login", json={"code": "mix"})).json()["access_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert r.status_code == 401


async def test_garbage_token_rejected(client):
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert r.status_code == 401


async def test_empty_code_rejected(client):
    assert (await client.post("/api/v1/auth/wx-login", json={"code": ""})).status_code == 422

async def test_error_envelope_shape(client):
    r = await client.get("/api/v1/me")           # 未带 token
    assert r.status_code == 401
    body = r.json()
    assert set(body) >= {"code", "message"}
    assert body["code"] == "TOKEN_MISSING"


async def test_error_never_leaks_internals(client):
    """错误响应不得含堆栈、SQL 或连接串。

    数据库用户名从配置里取，不写死 —— 这条测试本身会进版本库，
    把真实用户名硬编码进来等于自己泄露一次（而且凭据轮换后还会失效）。
    """
    from urllib.parse import urlparse

    from app.core.config import get_settings

    db_user = urlparse(get_settings().database_url.replace("+asyncpg", "")).username

    r = await client.get("/api/v1/me")
    text = r.text.lower()
    leaks = ["traceback", "postgresql://", "asyncpg", "select ", "password"]
    if db_user:
        leaks.append(db_user.lower())
    for leak in leaks:
        assert leak not in text, f"错误响应泄露了 {leak}"


async def test_validation_error_uses_envelope(client):
    r = await client.post("/api/v1/auth/wx-login", json={})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "code" in body["detail"]["fields"]


async def test_health_ok(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


async def test_sensitive_keys_cover_private_text():
    """脱敏名单必须覆盖夜记正文与凭证。"""
    from app.core.errors import SENSITIVE_KEYS
    for key in ("gratitudes", "plans", "openid", "session_key",
                "access_token", "refresh_token"):
        assert key in SENSITIVE_KEYS, key


def test_scrub_masks_sensitive_values():
    from app.core.errors import scrub
    out = scrub({"gratitudes": ["私人内容"], "ritual_date": "2026-08-27"})
    assert out["gratitudes"] == "***"
    assert out["ritual_date"] == "2026-08-27"


def test_error_envelope_carries_chinese_message():
    """message 必须是给人看的中文，不是错误码的复读。"""
    from app.core.errors import ERROR_MESSAGES, _envelope

    body = _envelope("ART_IN_USE", ERROR_MESSAGES["ART_IN_USE"])
    assert body["code"] == "ART_IN_USE"
    assert body["message"] != "ART_IN_USE"
    assert "收藏" in body["message"]


def test_every_error_code_raised_in_app_has_a_message():
    """新增错误码时忘了配文案，这条会红。"""
    import ast
    from pathlib import Path

    from app.core.errors import ERROR_MESSAGES

    app_dir = Path(__file__).resolve().parent.parent / "app"
    raised: set[str] = set()
    for path in app_dir.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            # 约定：HTTPException 的第二个位置参数是错误码字符串
            if (isinstance(node, ast.Call)
                    and getattr(node.func, "id", None) == "HTTPException"
                    and len(node.args) >= 2
                    and isinstance(node.args[1], ast.Constant)
                    and isinstance(node.args[1].value, str)):
                raised.add(node.args[1].value)

    missing = sorted(raised - set(ERROR_MESSAGES))
    assert not missing, f"这些错误码没有中文文案：{missing}"


async def test_http_error_response_has_readable_message(client):
    r = await client.get("/api/v1/admin/me")
    assert r.status_code == 401
    assert r.json()["code"] == "TOKEN_MISSING"
    assert r.json()["message"] == "请先登录"

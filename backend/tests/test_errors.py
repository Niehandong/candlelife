from app.core import codes
from tests.conftest import body, err, failed, msg


async def test_error_envelope_shape(client):
    r = await client.get("/api/v1/me")           # 未带 token
    # 失败响应也是信封，三个字段一个不多一个不少；data 为 null 而不是缺席，
    # 这样前端不用判断字段在不在。
    assert set(r.json()) == {"code", "msg", "data"}
    failed(r, codes.TOKEN_MISSING)
    assert r.json()["data"] is None


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
    failed(r, codes.UNPROCESSABLE)
    # 哪几个字段不合法放在 data 里 —— 失败时 data 不一定是 null
    assert "code" in r.json()["data"]["fields"]


async def test_health_ok(client):
    r = await client.get("/health")
    assert r.status_code == 200 and body(r)["status"] == "ok"


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
    """msg 必须是给人看的中文，不是错误码的复读。"""
    from app.core.errors import ERROR_MESSAGES, _envelope

    envelope = _envelope("ART_IN_USE", ERROR_MESSAGES["ART_IN_USE"])
    # 对外是数字码，字符串名只活在代码里
    assert envelope["code"] == codes.ART_IN_USE
    assert "收藏" in envelope["msg"]


def test_every_error_code_raised_in_app_has_a_message():
    """新增错误码时忘了配文案，这条会红。

    扫的是 `ApiError("XXX")` 的第一个位置参数。原先扫的是
    `HTTPException(status, "XXX")` 的第二个参数 —— 抛出方式改成 ApiError 之后
    那个模式在 app/ 里一个都不剩，扫描会得到空集、断言恒成立，
    变成一条【永远通过的假测试】。下面的 `assert raised` 就是防这个的。
    """
    import ast
    from pathlib import Path

    from app.core.errors import ERROR_MESSAGES

    app_dir = Path(__file__).resolve().parent.parent / "app"
    raised: set[str] = set()
    for path in app_dir.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            # 约定：ApiError 的第一个位置参数是错误码字符串
            if (isinstance(node, ast.Call)
                    and getattr(node.func, "id", None) == "ApiError"
                    and node.args
                    and isinstance(node.args[0], ast.Constant)
                    and isinstance(node.args[0].value, str)):
                raised.add(node.args[0].value)

    assert raised, (
        "一个 ApiError 抛出点都没扫到 —— 抛出方式又变了？"
        "这条测试正在空转，先修扫描规则再说。")
    missing = sorted(raised - set(ERROR_MESSAGES))
    assert not missing, f"这些错误码没有中文文案：{missing}"


def test_code_numbers_and_messages_stay_in_sync():
    """codes.py 与 errors.py 的两张表必须同增同减。

    新增错误码要动两处：CODE_NUMBERS 加数字、ERROR_MESSAGES 加中文。
    codes.py 的注释一直声称「两处缺一，tests/test_errors.py 会红」——
    在补上这条之前那句话是空头支票，两张表只是碰巧一致。
    """
    from app.core.codes import CODE_NUMBERS
    from app.core.errors import ERROR_MESSAGES

    assert set(CODE_NUMBERS) == set(ERROR_MESSAGES), (
        f"只在 CODE_NUMBERS：{sorted(set(CODE_NUMBERS) - set(ERROR_MESSAGES))}；"
        f"只在 ERROR_MESSAGES：{sorted(set(ERROR_MESSAGES) - set(CODE_NUMBERS))}")


def test_error_codes_are_unique():
    """两个错误码撞号，前端就永远分不开这两种失败。"""
    from app.core.codes import CODE_NUMBERS

    seen: dict[int, str] = {}
    for name, number in CODE_NUMBERS.items():
        assert number not in seen, f"{name} 与 {seen[number]} 都是 {number}"
        seen[number] = name


async def test_http_error_response_has_readable_message(client):
    r = await client.get("/api/v1/admin/me")
    failed(r, codes.TOKEN_MISSING)
    assert msg(r) == "请先登录"


# ── /api 下 HTTP 状态一律 200 ────────────────────────────────────────

async def test_unmatched_api_path_is_200_with_not_found_code(client):
    """/api 下路径写错也返回 200 + 40400。

    【这条最容易静默落空】路由匹配不上时抛的是 starlette 的 HTTPException，
    不是 fastapi 的。异常处理器若只注册在 fastapi.HTTPException 上就捕不到它，
    于是这个响应会漏成真正的 404 —— 而其余测试全都打得中路由，
    没有任何一条会发现。所以必须专门写这一条。
    """
    failed(await client.get("/api/v1/no-such-endpoint"), codes.NOT_FOUND)


async def test_wrong_method_on_api_path_is_200_with_method_code(client):
    """路径对但方法不对 → 200 + 40500。同样来自 starlette 而非业务代码。"""
    failed(await client.delete("/api/v1/config"), codes.METHOD_NOT_ALLOWED)


async def test_non_api_paths_keep_real_http_status(client):
    """/api 之外保持真实状态码。

    /static 是文件服务不是业务接口 —— 图片不存在就该 404，
    浏览器 <img> 的 onerror 靠它触发；包成 200 会让图裂检测失效。
    """
    assert (await client.get("/static/art/definitely-not-here.jpg")).status_code == 404
    assert (await client.get("/health")).status_code == 200


async def test_failure_carries_biz_code_header(client):
    """失败响应必须带 X-Biz-Code，否则网关侧无法按业务码统计错误率。

    这是「一律 200」唯一的真实代价的对冲：access log 里全是 200，
    Nginx 用 $upstream_http_x_biz_code 才能继续分类。
    """
    r = await client.get("/api/v1/me")
    assert r.headers["X-Biz-Code"] == str(codes.TOKEN_MISSING)


async def test_success_response_has_no_biz_code_header(client):
    """成功响应不带这个头 —— 它是给「出错了」用的信号，不该常驻。"""
    r = await client.get("/api/v1/config")
    assert "X-Biz-Code" not in r.headers


def test_every_api_error_code_maps_to_a_valid_http_status():
    """编号规则「HTTP 状态 + 两位序号」必须成立。

    /api 的出口虽然一律 200，但 ApiError 仍按 code // 100 推导真实状态，
    非 API 路径和日志用得上。编号编歪了（比如写成 4091）这里会红。
    """
    from app.core.codes import CODE_NUMBERS
    from app.core.errors import http_status_for

    valid = {400, 401, 403, 404, 405, 409, 410, 422, 429, 500, 502}
    bad = {name: http_status_for(name) for name in CODE_NUMBERS
           if http_status_for(name) not in valid}
    assert not bad, f"这些码推不出合法的 HTTP 状态：{bad}"

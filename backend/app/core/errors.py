import logging
import uuid

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.password import MIN_PASSWORD_LEN as _MIN_PASSWORD_LEN

logger = logging.getLogger("zhusheng")

# 绝不可进入日志或事件的字段
SENSITIVE_KEYS = {"gratitudes", "plans", "openid", "session_key",
                  "gratitudes_enc", "plans_enc", "access_token", "refresh_token",
                  "hashed_password", "password"}


def scrub(data: dict) -> dict:
    return {k: ("***" if k in SENSITIVE_KEYS else v) for k, v in data.items()}

# 错误码 → 面向用户的中文。阶段一这里是 _envelope(code, code)，
# message 等于错误码本身，前端只能自己维护一张映射表。根因在这里，就在这里修。
#
# 新增错误码时必须同时在这里加一行——tests/test_errors.py 会扫描全部
# HTTPException 的错误码，漏配就红。
ERROR_MESSAGES: dict[str, str] = {
    # 通用
    "HTTP_ERROR": "请求未能完成",
    "VALIDATION_ERROR": "请求参数不合法",
    "INTERNAL_ERROR": "服务器内部错误",
    # 鉴权。三者刻意都说「登录已失效」——未登录者不该从错误信息里
    # 推断出任何账号是否存在，也不该知道 token 具体哪里不对。
    "TOKEN_MISSING": "请先登录",
    "TOKEN_INVALID": "登录已失效，请重新登录",
    "TOKEN_KIND_MISMATCH": "登录已失效，请重新登录",
    # 微信登录
    "WX_CODE_INVALID": "微信登录失败，请退出小程序后重试",
    "WX_TOKEN_UNAVAILABLE": "微信服务暂时不可用，请稍后再试",
    # 用户
    "USER_NOT_FOUND": "登录已失效，请重新登录",
    "NICKNAME_REJECTED": "这个昵称不合规，换一个试试",
    # 夜记
    "NIGHT_NOT_FOUND": "找不到这个仪式夜的记录",
    "RECORD_LOCKED": "这条夜记已经过了可修改的时间",
    # 管理后台
    "ADMIN_LOGIN_FAILED": "用户名或密码不正确",
    "ADMIN_INACTIVE": "该账号已停用",
    "ADMIN_NOT_FOUND": "登录已失效，请重新登录",
    "TOO_MANY_ATTEMPTS": "尝试次数过多，请一分钟后再试",
    "PASSWORD_TOO_LONG": "密码过长（上限 72 字节，中文一字算 3 字节）",
    # 文案带上实际下限，避免常量改了文案还写着旧数字
    "PASSWORD_TOO_SHORT": f"新密码至少 {_MIN_PASSWORD_LEN} 位",
    "PASSWORD_UNCHANGED": "新密码与当前密码相同",
    "CURRENT_PASSWORD_WRONG": "当前密码不正确",
    "PASSWORD_CHANGED": "密码已变更，请重新登录",
    "CONFIG_INVALID": "配置不合法，请检查标红的字段",
    # 作品
    "ART_NOT_FOUND": "找不到这幅作品",
    "ART_WITHDRAWN": "这幅作品已撤回",
    "ART_IN_USE": "这幅作品已被收藏，只能下架或撤回，不能删除",
    "ART_ID_TAKEN": "这个标识已被占用，请换一个",
}


def _envelope(code: str, message: str, detail=None) -> dict:
    body = {"code": code, "message": message}
    if detail is not None:
        body["detail"] = detail
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException):
        # 约定：HTTPException 的 detail 传错误码字符串
        code = exc.detail if isinstance(exc.detail, str) else "HTTP_ERROR"
        # 兜底用「请求未能完成」而不是 code：漏配文案时用户看到的是一句中文，
        # 不是一串英文大写。漏配本身由 tests/test_errors.py 在开发期拦下。
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code, ERROR_MESSAGES.get(code, "请求未能完成")),
            headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
        return JSONResponse(
            status_code=422,
            content=_envelope("VALIDATION_ERROR", "请求参数不合法", {"fields": fields}))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        request_id = uuid.uuid4().hex
        # 记全栈到日志，但响应体绝不含堆栈、SQL 或连接串
        logger.exception("unhandled error request_id=%s path=%s", request_id, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("INTERNAL_ERROR", "服务器内部错误", {"request_id": request_id}))

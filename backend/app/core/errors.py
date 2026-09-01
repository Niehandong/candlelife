import logging
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.codes import CODE_NUMBERS, OK
from app.core.password import MIN_PASSWORD_LEN as _MIN_PASSWORD_LEN

logger = logging.getLogger("zhusheng")

# 这个前缀下的响应【HTTP 状态一律 200】，成败只看 body 里的 code。
# 其余路径（/static、/docs、/health）保持真实状态码 —— 理由见 codes.py。
API_PREFIX = "/api/"

# 失败响应带上这个头，网关与监控不必解析 body 就能按业务码统计。
# Nginx: log_format ... '$upstream_http_x_biz_code'
BIZ_CODE_HEADER = "X-Biz-Code"

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
    # 路由层自产的两条：接口地址写错、方法用错。对外不解释细节。
    "NOT_FOUND": "接口不存在",
    "METHOD_NOT_ALLOWED": "请求方式不正确",
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


def ok_envelope(data) -> dict:
    """成功响应的信封。data 可以是任何 JSON 值，包括 null。"""
    return {"code": OK, "msg": "success", "data": data}


def http_status_for(code_name: str) -> int:
    """从业务码推出它「本来的」HTTP 状态：40902 → 409。

    `/api` 的出口不用它（一律 200），但非 API 路径与日志仍然需要这个信息，
    所以在这里保留而不是丢掉。编号规则「HTTP 状态 + 两位序号」由
    tests/test_errors.py 守着，这个函数是它唯一的消费者。
    """
    return CODE_NUMBERS.get(code_name, CODE_NUMBERS["HTTP_ERROR"]) // 100


class ApiError(HTTPException):
    """业务错误。写码名，不写状态码。

        raise ApiError("ART_IN_USE")
        raise ApiError("CONFIG_INVALID", {"fields": [...]})

    继承 HTTPException 是为了沿用 FastAPI 既有的抛出/捕获链路。
    `status_code` 存的是【推导出的真实状态】（409 这种），不是 200 ——
    「一律 200」是出口处的呈现决定，在 register_exception_handlers 里做，
    不在这里就把信息抹掉。

    为什么不再手写 `HTTPException(status.HTTP_409_CONFLICT, "ART_IN_USE")`：
    状态码和错误码分开写，写岔了没有任何东西拦得住。现在状态由码推导，
    物理上不可能不一致。
    """

    def __init__(self, code: str, detail=None):
        super().__init__(status_code=http_status_for(code), detail=code)
        self.code = code
        self.payload = detail


def _envelope(code: str, message: str, detail=None) -> dict:
    """失败响应的信封。

    对外给的是【数字】code（40101 这种），代码里传进来的是【字符串】名
    （"ADMIN_LOGIN_FAILED"）—— raise 时写名字可读得多，改编号也不用动业务代码。
    翻译只发生在这一个出口。

    data 始终存在（失败时为 null），这样前端不用判断字段在不在。
    detail 有值时放进 data，让「哪几个字段不合法」这类信息有地方待。
    """
    return {
        "code": CODE_NUMBERS.get(code, CODE_NUMBERS["HTTP_ERROR"]),
        "msg": message,
        "data": detail,
    }


def _fail(request: Request, code: str, detail=None) -> JSONResponse:
    """统一构造失败响应：信封 + 状态码 + X-Biz-Code 头。

    `/api/**` 一律 200；其余路径（/static、/docs）用码推导出的真实状态。
    """
    body = _envelope(code, ERROR_MESSAGES.get(code, "请求未能完成"), detail)
    on_api = request.url.path.startswith(API_PREFIX)
    return JSONResponse(
        status_code=OK if on_api else http_status_for(code),
        content=body,
        headers={BIZ_CODE_HEADER: str(body["code"])})


# Starlette 自己产生的状态码 → 业务码。路由没匹配上时抛的是
# starlette 的 HTTPException，detail 是 "Not Found" 这种英文，不是码名。
_STATUS_TO_CODE = {
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
}


def register_exception_handlers(app: FastAPI) -> None:
    # 注册在 StarletteHTTPException 上而不是 fastapi.HTTPException：
    # 【路由未匹配时抛的是 starlette 那个基类】，注册在子类上捕不到它，
    # 于是「/api 下路径写错也返回 200」会静默落空。
    # fastapi.HTTPException 是它的子类，一并被这个处理器接住。
    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        if isinstance(exc, ApiError):
            return _fail(request, exc.code, exc.payload)
        # 约定：业务代码抛 HTTPException 时 detail 传错误码字符串
        if isinstance(exc.detail, str) and exc.detail in CODE_NUMBERS:
            return _fail(request, exc.detail)
        # Starlette 自产的（404 / 405），按状态码翻译。
        # 兜底用「请求未能完成」而不是码名：漏配文案时用户看到的是一句中文，
        # 不是一串英文大写。漏配本身由 tests/test_errors.py 在开发期拦下。
        return _fail(request, _STATUS_TO_CODE.get(exc.status_code, "HTTP_ERROR"))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
        return _fail(request, "VALIDATION_ERROR", {"fields": fields})

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        # 复用访问日志那条的 id —— 用户报错时给的是响应头里的 X-Request-Id，
        # 两处对不上就查不到人。取不到（中间件没跑到）才新生成一个。
        from app.core.logging import request_id_var
        request_id = request_id_var.get() or uuid.uuid4().hex[:8]
        # 记全栈到日志，但响应体绝不含堆栈、SQL 或连接串
        logger.exception("unhandled error request_id=%s path=%s", request_id, request.url.path)
        return _fail(request, "INTERNAL_ERROR", {"request_id": request_id})

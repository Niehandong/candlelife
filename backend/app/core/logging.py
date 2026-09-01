"""日志配置：按天切分，保留 30 天。

【文件在哪】`backend/logs/`
    zhusheng.log               当天，一直写
    zhusheng.log.2026-08-31    过了午夜自动改名成这样
    …                          最多留 30 份，更早的自动删

这与 `.run/backend.log` 是两回事，不要混：

| | 内容 | 谁写的 |
|---|---|---|
| `logs/zhusheng.log` | 应用日志：访问记录、警告、异常 | 本模块配置的 handler |
| `.run/backend.log` | 进程的原始 stdout/stderr | dev.sh 的重定向 |

`.run/backend.log` 留着是有用的：日志系统还没起来之前的崩溃
（配置非法、端口被占、import 失败）只会出现在那里。

【为什么要自己写 access 日志】
uvicorn 自带的那行现在没有信息量了 —— `/api` 下的 HTTP 状态**一律 200**
（见 core/codes.py），所以它对「未登录」「参数错误」「作品已撤回」
统统打印 `200 OK`，跟成功长得一模一样。真正能区分成败的是 body 里的业务码，
uvicorn 看不到它。所以 main.py 里关掉了 uvicorn 的 access log，改用
AccessLogMiddleware。
"""
import logging
import logging.handlers
import time
import uuid
from contextvars import ContextVar
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.errors import BIZ_CODE_HEADER

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOG_FILE = LOG_DIR / "zhusheng.log"
BACKUP_DAYS = 30

# 请求 id。异常处理器要用同一个 id，用户报错时才能在日志里对上号。
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

_FORMAT = "%(asctime)s %(levelname)-5s %(name)-14s %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"

_configured = False


def setup_logging(level: int = logging.INFO) -> None:
    """装上文件与控制台 handler。重复调用是安全的（reload 时会再调一次）。"""
    global _configured
    if _configured:
        return

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(_FORMAT, datefmt=_DATEFMT)

    # when="midnight" + backupCount=30：当天写 zhusheng.log，
    # 过了午夜改名成 zhusheng.log.YYYY-MM-DD，只留最近 30 份。
    file_handler = logging.handlers.TimedRotatingFileHandler(
        LOG_FILE, when="midnight", backupCount=BACKUP_DAYS,
        encoding="utf-8", utc=False)
    # 默认后缀是 %Y-%m-%d，显式写出来免得哪天被改掉还没人发现
    file_handler.suffix = "%Y-%m-%d"
    file_handler.setFormatter(formatter)

    console = logging.StreamHandler()
    console.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(file_handler)
    root.addHandler(console)

    # uvicorn 的 logger 默认 propagate=False，不接根 handler ——
    # 不显式接上的话，启动信息与异常堆栈进不了日志文件。
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True

    # 【uvicorn.access 要按死，不能只清 handler】
    # main.py 里传了 access_log=False，uvicorn 靠把这个 logger 的 propagate
    # 设成 False 来落实它。而 setup_logging() 跑在 create_app() 里，
    # 晚于 uvicorn 配置日志 —— 若在这里把 propagate 设回 True，
    # 就正好把 access_log=False 撤销了，日志里每个请求会出现两行。
    # （这个坑真踩过，第一版就是这么写的。）
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.handlers.clear()
    uvicorn_access.propagate = False
    uvicorn_access.disabled = True

    _configured = True


access_logger = logging.getLogger("zhusheng.access")


class AccessLogMiddleware(BaseHTTPMiddleware):
    """每个请求一行访问日志。

    形如：
        10.130.255.118 GET /api/v1/me → 200/40101 请先登录 (3ms) [a1b2c3d4]
        10.130.255.118 GET /api/v1/nights → 200/200 (12ms) [a1b2c3d4]

    `200/40101` 是「HTTP 状态 / 业务码」—— 因为 /api 下 HTTP 恒为 200，
    只有后一个数字能区分成败。

    【绝不记录的东西】请求体、Authorization 头、Cookie。
    夜记正文是加密存库的，把它记进日志等于在明文旁边放一份副本。
    路径与查询串会记 —— 它们只含日期、作品 id、分页参数这类非敏感信息。
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex[:8]
        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            # 异常仍会被 errors.py 的处理器接住并返回 500；
            # 这里只补一条访问日志，免得出错的请求反而没有记录。
            elapsed = (time.perf_counter() - started) * 1000
            access_logger.error(
                "%s %s %s → 异常 (%.0fms) [%s]",
                _client(request), request.method, _path(request), elapsed, request_id)
            request_id_var.reset(token)
            raise

        elapsed = (time.perf_counter() - started) * 1000
        biz = response.headers.get(BIZ_CODE_HEADER)

        # 失败响应带 X-Biz-Code；成功的没有这个头，业务码就是 200
        on_api = request.url.path.startswith("/api/")
        if not on_api:
            # 非 /api 的路径 HTTP 状态是真的，业务码那一格没有意义
            status_pair = str(response.status_code)
        elif biz:
            status_pair = f"{response.status_code}/{biz}"
        else:
            status_pair = f"{response.status_code}/200"
        failed = bool(biz) or response.status_code >= 400
        level = logging.WARNING if failed else logging.INFO

        access_logger.log(
            level, "%s %s %s → %s%s (%.0fms) [%s]",
            _client(request), request.method, _path(request),
            status_pair, _reason(request, response, biz), elapsed, request_id)

        response.headers["X-Request-Id"] = request_id
        request_id_var.reset(token)
        return response


def _client(request) -> str:
    """客户端 IP。反代之后要看 X-Forwarded-For，否则记到的全是 Nginx 自己。"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "-"


def _path(request) -> str:
    query = request.url.query
    return f"{request.url.path}?{query}" if query else request.url.path


def _reason(request, response, biz: str | None) -> str:
    """失败时附上中文说明，省得回头查码表。

    只对 /api 下的请求附 —— 静态文件的 404 是「图片不存在」，
    套上「接口不存在」这句话只会误导人。
    """
    if not biz or not request.url.path.startswith("/api/"):
        return ""
    from app.core.codes import CODE_NUMBERS
    from app.core.errors import ERROR_MESSAGES
    try:
        number = int(biz)
    except ValueError:
        return ""
    for name, value in CODE_NUMBERS.items():
        if value == number:
            return " " + ERROR_MESSAGES.get(name, name)
    return ""

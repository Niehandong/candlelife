"""业务错误码。

对外的响应信封是 {code, msg, data}，成功失败同一形状：

    成功  {"code": 200,   "msg": "success", "data": {...}}
    失败  {"code": 40101, "msg": "用户名或密码不正确", "data": null}

## `/api/**` 的 HTTP 状态码一律 200

判断成功与否**只看 body 里的 code**，不看 HTTP 状态。这是用户的决策：
一个响应只该有一层「响应码」，两层各判一次是多余的。

  - `/api/**`  —— 一律 200，含路径写错（40400）、方法不对（40500）
  - `/static/**` —— 保持真实状态。那是文件服务不是业务接口，
                    图片不存在就该 404，浏览器 <img> 的 onerror 靠它触发
  - `/docs`、`/redoc`、`/openapi.json` —— 保持真实，否则 Swagger UI 打不开
  - `/health` —— 本来就是 200

**代价与对冲**：Nginx access log 里全是 200，按状态码统计错误率的手段失效。
因此失败响应会带一个 `X-Biz-Code: 40101` 头，网关侧用
`$upstream_http_x_biz_code` 就能继续分类，不必解析响应体。

## 编码规则：仍是「HTTP 状态码 + 两位序号」

它不再承载 HTTP 语义，而是一套**读得懂的命名空间**：看到 40902 仍然一眼知道
「冲突类的第 2 个」，不用查表；新增码时也不用想该归到哪一段。
`ApiError` 内部仍按 `code // 100` 推导出一个 HTTP 状态，供非 `/api` 路径使用 ——
信息留着，只是 `/api` 的出口不用它。

新增错误码的步骤：
  1. 在下面对应的段里加一行（序号接着往下排，不要复用已删的号）
  2. 在 app/core/errors.py 的 ERROR_MESSAGES 里加中文文案
  3. 两处缺一，tests/test_errors.py::test_code_numbers_and_messages_stay_in_sync 会红

字符串名（如 ADMIN_LOGIN_FAILED）继续在代码里用 —— `raise ApiError("ADMIN_LOGIN_FAILED")`
比写数字可读得多，而且改编号不用动业务代码。数字只在出口处出现。
"""

# 成功
OK = 200

# 400xx —— 请求本身有问题
BAD_REQUEST = 40000            # HTTP_ERROR 的兜底

# 401xx —— 没登录 / 登录失效 / 凭据不对
UNAUTHORIZED = 40100           # 兜底
TOKEN_MISSING = 40101
TOKEN_INVALID = 40102
TOKEN_KIND_MISMATCH = 40103
ADMIN_LOGIN_FAILED = 40104
ADMIN_NOT_FOUND = 40105        # token 有效但账号已删；对外仍说「登录已失效」
CURRENT_PASSWORD_WRONG = 40106
PASSWORD_CHANGED = 40107       # 改密后，签发时刻早于改密时间的 token
WX_CODE_INVALID = 40108
USER_NOT_FOUND = 40109         # 同上，对外说「登录已失效」，不暴露账号是否存在

# 403xx —— 认证过了但没权限
FORBIDDEN = 40300
ADMIN_INACTIVE = 40301

# 404xx —— 找不到
NOT_FOUND = 40400              # 路径不存在（Starlette 的路由未匹配）
NIGHT_NOT_FOUND = 40401
ART_NOT_FOUND = 40402

# 405xx —— 路径对但方法不对
METHOD_NOT_ALLOWED = 40500

# 409xx —— 与当前状态冲突
CONFLICT = 40900
RECORD_LOCKED = 40901
ART_IN_USE = 40902
ART_ID_TAKEN = 40903

# 410xx —— 曾经存在，现在没了
GONE = 41000
ART_WITHDRAWN = 41001

# 422xx —— 参数校验没过
UNPROCESSABLE = 42200          # VALIDATION_ERROR 的兜底
CONFIG_INVALID = 42201
PASSWORD_TOO_LONG = 42202
PASSWORD_TOO_SHORT = 42203
PASSWORD_UNCHANGED = 42204
NICKNAME_REJECTED = 42205

# 429xx —— 限流
TOO_MANY_REQUESTS = 42900
TOO_MANY_ATTEMPTS = 42901

# 500xx —— 服务端自己的问题
INTERNAL_ERROR = 50000

# 502xx —— 依赖的外部服务不可用
BAD_GATEWAY = 50200
WX_TOKEN_UNAVAILABLE = 50201


# 字符串名 → 数字。errors.py 在出口处用它把符号翻成数字。
# 键必须与 ERROR_MESSAGES 的键完全一致，tests/test_errors.py 断言这一点。
CODE_NUMBERS: dict[str, int] = {
    "HTTP_ERROR": BAD_REQUEST,
    "VALIDATION_ERROR": UNPROCESSABLE,
    "INTERNAL_ERROR": INTERNAL_ERROR,
    # 路由层自己产生的两个：路径不存在、方法不对。
    # 它们不由业务代码 raise，而是 Starlette 抛出后在 errors.py 里按状态码翻译。
    "NOT_FOUND": NOT_FOUND,
    "METHOD_NOT_ALLOWED": METHOD_NOT_ALLOWED,

    "TOKEN_MISSING": TOKEN_MISSING,
    "TOKEN_INVALID": TOKEN_INVALID,
    "TOKEN_KIND_MISMATCH": TOKEN_KIND_MISMATCH,
    "WX_CODE_INVALID": WX_CODE_INVALID,
    "WX_TOKEN_UNAVAILABLE": WX_TOKEN_UNAVAILABLE,
    "USER_NOT_FOUND": USER_NOT_FOUND,
    "NICKNAME_REJECTED": NICKNAME_REJECTED,

    "NIGHT_NOT_FOUND": NIGHT_NOT_FOUND,
    "RECORD_LOCKED": RECORD_LOCKED,

    "ADMIN_LOGIN_FAILED": ADMIN_LOGIN_FAILED,
    "ADMIN_INACTIVE": ADMIN_INACTIVE,
    "ADMIN_NOT_FOUND": ADMIN_NOT_FOUND,
    "TOO_MANY_ATTEMPTS": TOO_MANY_ATTEMPTS,
    "PASSWORD_TOO_LONG": PASSWORD_TOO_LONG,
    "PASSWORD_TOO_SHORT": PASSWORD_TOO_SHORT,
    "PASSWORD_UNCHANGED": PASSWORD_UNCHANGED,
    "CURRENT_PASSWORD_WRONG": CURRENT_PASSWORD_WRONG,
    "PASSWORD_CHANGED": PASSWORD_CHANGED,
    "CONFIG_INVALID": CONFIG_INVALID,

    "ART_NOT_FOUND": ART_NOT_FOUND,
    "ART_WITHDRAWN": ART_WITHDRAWN,
    "ART_IN_USE": ART_IN_USE,
    "ART_ID_TAKEN": ART_ID_TAKEN,
}

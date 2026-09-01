"""把成功响应包进统一信封 {code, msg, data}。

【为什么用中间件而不是改每个路由】
21 个接口逐个改 return，等于给未来每个新接口都埋一个「忘了包」的机会，
而且 response_model 会失效（FastAPI 校验的是包装后的形状，不是业务模型）。
中间件在出口统一处理：路由照常 return 业务对象，OpenAPI 里也照常是业务模型。

【什么不包】
  - 失败响应：由 core/errors.py 的异常处理器自己包，不重复包
  - 非 JSON：图片、下载的 JSON 文件（Content-Disposition: attachment）
  - 文档与 openapi.json：/docs、/redoc、/openapi.json 得保持原样，
    否则 Swagger UI 打不开
  - 204 无内容：没有 body 可包

【代价】要把响应体读出来再重新写回，多一次序列化。对这个体量的接口
（最大的是 42 字段的配置）可以忽略；真出现大响应时再考虑改成路由级包装。
"""

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.codes import OK

# 这些路径下的响应原样透传
_BYPASS_PREFIXES = ("/docs", "/redoc", "/openapi.json", "/static")


class ResponseEnvelopeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, bypass: tuple[str, ...] = _BYPASS_PREFIXES):
        super().__init__(app)
        self._bypass = bypass

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        if any(request.url.path.startswith(p) for p in self._bypass):
            return response

        # 失败响应已经由异常处理器包过信封了，别包第二层
        if response.status_code >= 400:
            return response

        if response.status_code == 204 or response.status_code == 304:
            return response

        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("application/json"):
            return response

        # 配置导出走的是 attachment 下载，包了信封文件就不能直接用了
        if "attachment" in response.headers.get("content-disposition", ""):
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        try:
            data = json.loads(body) if body else None
        except json.JSONDecodeError:
            # 不是合法 JSON 就别动它 —— 与其猜，不如原样放行
            return Response(
                content=body, status_code=response.status_code,
                headers=dict(response.headers), media_type=response.media_type)

        # 已经是信封形状就不重复包（比如某个路由自己返回了信封）
        if isinstance(data, dict) and set(data) == {"code", "msg", "data"}:
            wrapped = data
        else:
            wrapped = {"code": OK, "msg": "success", "data": data}

        payload = json.dumps(wrapped, ensure_ascii=False).encode("utf-8")

        headers = dict(response.headers)
        # 长度变了，旧的 content-length 必须去掉，否则客户端会读半截
        headers.pop("content-length", None)

        return Response(content=payload, status_code=response.status_code,
                        headers=headers, media_type="application/json")

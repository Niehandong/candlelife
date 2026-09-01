"""让 OpenAPI 如实描述响应信封。

【问题】信封 `{code, msg, data}` 是中间件在出口加的，而路由声明的
`response_model=NightList` 描述的是【裸载荷】。于是 /docs 与 openapi.json 说的
和实际返回的不是一回事 —— 后台前端那 11 条「与后端 OpenAPI 的契约」测试，
守的已经不是真实契约了。

【做法】标准 spec 生成完之后，把每个 `/api` 路径的 200 响应 schema 原地包一层：

    {"code": 200, "msg": "success", "data": <原来的 schema>}

【关键约束】`components.schemas` 里的业务模型（NightList、AppSection、
AdminArtItem…）**原样保留**。契约测试读的正是
`components.schemas[name].properties`，所以那 11 条一条都不用改，
而且立刻重新变成真契约。

【为什么不改路由的 response_model】改成 `Envelope[NightList]` 这类泛型，
21 个路由每个都要改，而且 FastAPI 会为每个组合生成一个新的
`components.schemas` 条目（`Envelope_NightList_`），业务模型名反而被埋进去，
契约测试全线失效。在 spec 生成后包装，路由代码一行不动。
"""

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.core.codes import OK
from app.core.errors import API_PREFIX

_ERROR_ENVELOPE_SCHEMA_NAME = "ErrorEnvelope"

_ERROR_ENVELOPE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["code", "msg", "data"],
    "properties": {
        "code": {
            "type": "integer",
            "description": "业务错误码。编号规则见 app/core/codes.py",
            "example": 40101,
        },
        "msg": {
            "type": "string",
            "description": "面向用户的中文说明，可直接展示",
            "example": "请先登录",
        },
        "data": {
            "nullable": True,
            "description": "失败时通常为 null；校验类错误会带上出错的字段",
            "example": None,
        },
    },
}


def _wrap_success(schema: dict[str, Any] | None) -> dict[str, Any]:
    """把一个业务 schema 包进成功信封。schema 为 None 表示 data 是 null。"""
    data: dict[str, Any] = (
        {"nullable": True, "description": "无返回内容", "example": None}
        if schema is None else dict(schema)
    )
    return {
        "type": "object",
        "required": ["code", "msg", "data"],
        "properties": {
            "code": {"type": "integer", "const": OK, "example": OK},
            "msg": {"type": "string", "example": "success"},
            "data": data,
        },
    }


def _is_wrapped(schema: dict[str, Any]) -> bool:
    """已经是信封形状就别包第二层（重复调用 openapi() 时会遇到）。"""
    props = schema.get("properties")
    return isinstance(props, dict) and set(props) == {"code", "msg", "data"}


def _error_code_catalog() -> dict[str, int]:
    """错误码全表，放进 openapi.json 的 info.x-error-codes。

    【为什么塞进 OpenAPI】两个前端的 codes.ts 手抄了这些数字，没有任何东西
    守着它们不漂移 —— 后端改一个编号，前端不会变红。把全表暴露出来之后，
    前端的契约测试就能逐个比对（与那 11 条 schema 契约同一套机制：
    需要后端真的在跑，否则整组 skip）。

    只暴露【码名 → 数字】，不暴露中文文案 —— 文案是运行时从 msg 拿的，
    前端不该也不需要抄第二份。
    """
    from app.core.codes import CODE_NUMBERS
    return dict(sorted(CODE_NUMBERS.items(), key=lambda kv: kv[1]))


def build_openapi(app: FastAPI) -> dict[str, Any]:
    spec = get_openapi(
        title=app.title, version=app.version, routes=app.routes,
        description=app.description or None,
    )

    spec.setdefault("components", {}).setdefault("schemas", {})[
        _ERROR_ENVELOPE_SCHEMA_NAME] = _ERROR_ENVELOPE_SCHEMA

    # 错误码全表。两个前端的 codes.ts 靠它做漂移检查，见 _error_code_catalog。
    spec.setdefault("info", {})["x-error-codes"] = _error_code_catalog()

    for path, operations in spec.get("paths", {}).items():
        # 只包 /api 下的。/health 与 /docs 不在这个前缀里，天然被排除；
        # /static 是 Mount，压根不出现在 paths 里。
        if not path.startswith(API_PREFIX):
            continue

        for method, operation in operations.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue

            responses = operation.get("responses", {})

            # 成功响应：把 data 换成原来的 schema
            for status in ("200", "201", "202", "204"):
                response = responses.pop(status, None)
                if response is None:
                    continue
                content = response.get("content", {}).get("application/json", {})
                schema = content.get("schema")
                if schema is not None and _is_wrapped(schema):
                    wrapped = schema
                else:
                    wrapped = _wrap_success(schema)
                response.setdefault("description", "成功")
                response["content"] = {"application/json": {"schema": wrapped}}
                # 201/202/204 都已归入 200：/api 下不存在别的状态码
                responses["200"] = response

            # FastAPI 为带路径/查询参数的接口自动加的 422，在「一律 200」下
            # 不会以 422 的形式出现，删掉免得文档误导。
            responses.pop("422", None)

            # 失败也是 200，只是 code 不同 —— 用一个 default 说明这件事，
            # 而不是罗列每个可能的错误码（那样每加一个码就要改所有接口）。
            responses.setdefault("default", {
                "description":
                    "失败。**HTTP 状态同样是 200**，判断成败看 body 里的 code；"
                    "响应头 X-Biz-Code 携带同一个码，供网关与监控统计。",
                "content": {"application/json": {
                    "schema": {"$ref":
                               f"#/components/schemas/{_ERROR_ENVELOPE_SCHEMA_NAME}"}}},
            })

            operation["responses"] = responses

    return spec


def install(app: FastAPI) -> None:
    """把自定义 openapi() 挂到 app 上，并带 FastAPI 惯用的缓存。"""

    def _openapi() -> dict[str, Any]:
        if not app.openapi_schema:
            app.openapi_schema = build_openapi(app)
        return app.openapi_schema

    app.openapi = _openapi        # type: ignore[method-assign]

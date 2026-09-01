"""OpenAPI 必须如实描述响应信封。

信封是中间件在出口加的，路由声明的 response_model 是裸载荷 ——
两者天然会分家。这组测试守住「文档说的就是实际返回的」。

**为什么值得专门守**：文档说谎不会让任何接口出错，只会让读文档的人写错代码。
后台前端那 11 条契约测试读的是 openapi.json，文档失真时它们守的东西也跟着失真，
是一种「测试还绿着但已经没用了」的状态。
"""
from app.core.codes import OK
from app.main import create_app


def _spec():
    return create_app().openapi()


def _json_schema(operation, status="200"):
    return (operation["responses"][status]["content"]["application/json"]["schema"])


def test_every_api_success_response_is_wrapped():
    """/api 下每个接口的 200 响应都描述成 {code, msg, data}。"""
    spec = _spec()
    bare = []
    for path, ops in spec["paths"].items():
        if not path.startswith("/api/"):
            continue
        for method, operation in ops.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            schema = _json_schema(operation)
            if set(schema.get("properties", {})) != {"code", "msg", "data"}:
                bare.append(f"{method.upper()} {path}")
    assert not bare, f"这些接口的 200 响应没描述成信封：{bare}"


def test_business_models_stay_in_components():
    """业务模型必须原样留在 components.schemas 里。

    admin/src/api/__tests__/contract.test.ts 读的正是
    components.schemas[name].properties。若把 response_model 改成
    Envelope[NightList] 这类泛型，FastAPI 会生成 Envelope_NightList_ 这种名字，
    业务模型名被埋进去，那 11 条契约测试会整组失效 —— 而且是静默失效。
    """
    spec = _spec()
    schemas = spec["components"]["schemas"]
    for name in ("NightList", "NightDetail", "CompleteResponse", "MeResponse",
                 "AppSection", "ScheduleSection", "OnboardingSection",
                 "RitualSection", "RecordsSection",
                 "AdminArtItem", "AdminArtListResponse", "AdminMeResponse"):
        assert name in schemas, f"components.schemas 里没有 {name}"

    # 且没有被泛型化成 Envelope_XXX_ 这类名字
    generic = [n for n in schemas if n.startswith("Envelope")]
    assert not generic, f"出现了泛型包装后的 schema 名：{generic}"


def test_data_field_points_at_the_business_model():
    """信封的 data 字段指向原来的业务模型，而不是被抹成一个泛泛的 object。"""
    spec = _spec()
    schema = _json_schema(spec["paths"]["/api/v1/nights"]["get"])
    assert schema["properties"]["data"]["$ref"].endswith("/NightList")


def test_success_code_is_pinned_to_200():
    spec = _spec()
    schema = _json_schema(spec["paths"]["/api/v1/nights"]["get"])
    assert schema["properties"]["code"]["const"] == OK


def test_no_api_operation_declares_a_non_200_status():
    """/api 下不该再出现 201 / 202 / 204 / 422 这些状态码。

    它们在「一律 200」下不会发生，留在文档里只会误导 ——
    尤其是 FastAPI 给带参数的接口自动加的那个 422。
    """
    spec = _spec()
    stray = []
    for path, ops in spec["paths"].items():
        if not path.startswith("/api/"):
            continue
        for method, operation in ops.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            for status in operation["responses"]:
                if status not in {"200", "default"}:
                    stray.append(f"{method.upper()} {path} → {status}")
    assert not stray, f"这些接口还声明着非 200 的状态码：{stray}"


def test_error_envelope_is_documented():
    """失败响应的形状要在文档里有，否则 /docs 上看不出错误长什么样。"""
    spec = _spec()
    assert "ErrorEnvelope" in spec["components"]["schemas"]
    operation = spec["paths"]["/api/v1/nights"]["get"]
    assert "default" in operation["responses"]
    ref = (operation["responses"]["default"]["content"]["application/json"]
           ["schema"]["$ref"])
    assert ref.endswith("/ErrorEnvelope")


def test_admin_config_put_keeps_its_request_body_shape():
    """PUT /admin/config 的请求体是裸 dict，靠 openapi_extra 补形状。

    这个特例不能在包装过程中被抹掉 —— 抹掉的话 /docs 上那 42 个字段
    完全没有描述，前端契约测试也无从比对。
    """
    spec = _spec()
    operation = spec["paths"]["/api/v1/admin/config"]["put"]
    ref = (operation["requestBody"]["content"]["application/json"]
           ["schema"]["$ref"])
    assert ref.endswith("/AdminConfigPayload")


def test_openapi_itself_is_not_wrapped():
    """/openapi.json 与 /docs 不能被信封包住，否则 Swagger UI 打不开。"""
    spec = _spec()
    assert "openapi" in spec and "paths" in spec
    assert set(spec) != {"code", "msg", "data"}

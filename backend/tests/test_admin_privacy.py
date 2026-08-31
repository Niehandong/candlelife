"""隐私硬约束的守门测试。

管理后台不提供任何查看用户个人数据的接口。这条约束靠 AST 扫描钉死，
防止阶段三做数据看板时顺手越界——那时改起来就贵了。

用 AST 而不是 grep：grep 会被注释和字符串里的同名词误伤，
AST 只看真正的标识符引用。
"""
import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parent.parent / "app"

# 这些名字一旦出现在 admin 代码里，就意味着后台能碰用户数据了
FORBIDDEN = {"decrypt_text", "decrypt_list", "NightRecord", "AnalyticsEvent"}


def _admin_source_files() -> list[Path]:
    files = sorted(p for p in (APP / "api" / "v1" / "admin").rglob("*.py")
                   if "__pycache__" not in p.parts)
    files += sorted(p for p in (APP / "services").glob("admin*.py")
                    if "__pycache__" not in p.parts)
    return files


def test_there_are_admin_files_to_scan():
    """守门测试自身的守门：文件挪走了要红，不能默默扫了个空集。"""
    files = _admin_source_files()
    assert len(files) >= 5, f"只找到 {len(files)} 个 admin 源文件，扫描范围可能失效了"


@pytest.mark.parametrize("path", _admin_source_files(), ids=lambda p: p.name)
def test_admin_module_never_touches_user_data(path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            found.add(node.id)
        elif isinstance(node, ast.Attribute):
            found.add(node.attr)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                found.add(alias.name.split(".")[-1])
                if alias.asname:
                    found.add(alias.asname)
            if isinstance(node, ast.ImportFrom) and node.module:
                found.update(node.module.split("."))

    leaked = FORBIDDEN & found
    assert not leaked, (
        f"{path.relative_to(APP.parent)} 引用了 {sorted(leaked)}。"
        "管理后台不得读取用户夜记、匿名事件，也不得解密任何正文。"
    )


def test_no_admin_route_imports_crypto_module():
    """连 import app.core.crypto 都不允许——引进来就迟早会用。"""
    for f in _admin_source_files():
        tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                assert "crypto" not in node.module, f"{f.name} 导入了 {node.module}"
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert "crypto" not in alias.name, f"{f.name} 导入了 {alias.name}"


def test_admin_routes_expose_no_user_endpoints():
    """从实际生成的 OpenAPI 确认：admin 前缀下没有任何用户相关路径。

    刻意读 app.openapi() 而不是 app.routes——本版 FastAPI 的 include_router
    存的是 _IncludedRouter 包装对象，app.routes 不展平子路由，遍历它会扫出空集
    （一个「永远通过」的假测试）。
    """
    from app.main import create_app

    spec = create_app().openapi()
    admin_paths = [p for p in spec["paths"] if p.startswith("/api/v1/admin")]
    assert admin_paths, "没有找到任何 admin 路由"
    for path in admin_paths:
        lowered = path.lower()
        for word in ("user", "night", "record", "journal", "event", "gratitude", "plan"):
            assert word not in lowered, f"admin 路由 {path} 含可疑路径段 {word!r}"


def test_admin_response_schemas_carry_no_user_content():
    """从 OpenAPI 的 schema 层面确认 admin 响应里没有正文字段。"""
    from app.main import create_app

    spec = create_app().openapi()
    forbidden_fields = {"gratitudes", "plans", "gratitudes_enc", "plans_enc",
                        "openid", "session_key", "hashed_password"}
    for name, schema in spec["components"]["schemas"].items():
        if not name.startswith("Admin"):
            continue
        leaked = forbidden_fields & set(schema.get("properties", {}))
        assert not leaked, f"{name} 暴露了 {sorted(leaked)}"

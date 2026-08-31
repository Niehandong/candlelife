"""domain 层必须是纯函数：零 IO、不读系统时间、不读环境变量。

用 AST 检查而非 grep，避免文档字符串误报。这条约束若被破坏，
服务端与小程序端的判定就可能漂移（原型阶段的真实教训）。
"""
import ast
from pathlib import Path

DOMAIN_DIR = Path(__file__).resolve().parents[1] / "app" / "domain"

FORBIDDEN_IMPORTS = {"sqlalchemy", "redis", "httpx", "os", "fastapi", "app.core", "app.models"}
FORBIDDEN_CALLS = {("datetime", "now"), ("datetime", "utcnow"), ("date", "today"),
                   ("time", "time"), ("time", "localtime")}


def _modules():
    return [p for p in DOMAIN_DIR.glob("*.py") if p.name != "__init__.py"]


def test_domain_has_no_io_imports():
    for path in _modules():
        tree = ast.parse(path.read_text("utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                root = name.split(".")[0]
                assert root not in FORBIDDEN_IMPORTS and name not in FORBIDDEN_IMPORTS, \
                    f"{path.name} 导入了被禁止的 {name}"


def test_domain_never_reads_current_time():
    """当前时刻必须由调用方传入，否则无法测试且会引入本地时区依赖。"""
    for path in _modules():
        tree = ast.parse(path.read_text("utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                obj = node.func.value
                if isinstance(obj, ast.Name) and (obj.id, node.func.attr) in FORBIDDEN_CALLS:
                    raise AssertionError(f"{path.name} 调用了 {obj.id}.{node.func.attr}()")


def test_domain_modules_exist():
    assert _modules(), "domain 目录为空"

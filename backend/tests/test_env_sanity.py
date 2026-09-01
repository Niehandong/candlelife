"""运行环境的护栏。

【为什么需要这个文件】
这个 venv 建在 backend/.venv，后来被整个搬到仓库根。搬家之后有三处仍指着旧路径
（bin/ 下的 shebang、pyvenv.cfg、activate 的 VIRTUAL_ENV），`.venv/bin/alembic`
会报 `cannot execute: required file not found`。

更隐蔽的是 site-packages 里的残留：pyproject.toml 时代 `pip install -e .` 装进去的
editable 钩子（`__editable__.zhusheng_backend-0.1.0.pth` 与它的 finder）。
pyproject.toml 删了，钩子还活着 —— 它往 sys.meta_path 里插一个 finder，
把 `import app` 硬绑到某个绝对路径。

于是「从 backend/ 目录运行」这条约定一直没被真正执行过：在任何目录跑 pytest
都能 import 成功，不是因为路径对，是因为有个隐形钩子在兜底。

这几条测试把那件事钉住：环境必须自洽，且不许再长出第二套解析路径。
"""
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND = REPO_ROOT / "backend"


def test_running_inside_the_repo_venv():
    """跑测试用的必须是仓库根的 .venv，不是系统 python 或别处的环境。"""
    expected = REPO_ROOT / ".venv"
    assert Path(sys.prefix).resolve() == expected.resolve(), (
        f"当前解释器在 {sys.prefix}，应当是 {expected}。\n"
        f"用 ../.venv/bin/python -m pytest 运行（见 CLAUDE.md）。"
    )


def test_no_editable_install_hook_on_meta_path():
    """sys.meta_path 里不许有 editable finder。

    有它在，import app 就绕过了正常的路径解析，「必须 cd backend」这条约定
    会变成一句没人执行的空话 —— 直到某天钩子指向的目录被挪走才暴露。
    """
    ghosts = [f for f in sys.meta_path if "editable" in str(f).lower()]
    assert not ghosts, (
        f"sys.meta_path 里有 editable 安装钩子：{ghosts}\n"
        f"执行 ../.venv/bin/python -m pip uninstall zhusheng-backend 清掉它。"
    )


def test_no_editable_artifacts_in_site_packages():
    """site-packages 里不许留下 editable 安装的残骸。

    上面那条只看当前进程加载了什么；这条看盘上还有没有，
    免得「这次没加载」被误读成「已经清干净」。
    """
    site_packages = Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
    leftovers = sorted(
        p.name for p in site_packages.iterdir()
        if "editable" in p.name.lower() or p.name.lower().startswith("zhusheng")
    )
    assert not leftovers, f"site-packages 里有 editable 残骸：{leftovers}"


def test_app_package_resolves_to_this_repo():
    """import app 必须解析到本仓库的 backend/app，而不是别处的同名包。"""
    import app

    resolved = Path(app.__file__).resolve()
    expected = (BACKEND / "app" / "__init__.py").resolve()
    assert resolved == expected, f"app 解析到了 {resolved}，应当是 {expected}"


def test_venv_scripts_have_correct_shebang():
    """bin/ 下的可执行文件必须指向本 venv 的解释器。

    venv 搬过位置而没修 shebang 时，`../.venv/bin/alembic` 会报
    `cannot execute: required file not found` —— 报错信息完全看不出根因，
    很容易被误判成「alembic 没装」。
    """
    bindir = Path(sys.prefix) / "bin"
    expected_prefix = f"#!{bindir}"
    broken = []
    for script in sorted(bindir.iterdir()):
        if not script.is_file() or script.is_symlink():
            continue
        try:
            first = script.read_text(encoding="utf-8", errors="strict").split("\n", 1)[0]
        except (UnicodeDecodeError, OSError):
            continue                      # 二进制文件（python 本体等），跳过
        if not first.startswith("#!"):
            continue
        if "python" in first and not first.startswith(expected_prefix):
            broken.append(f"{script.name}: {first}")
    assert not broken, (
        "这些脚本的 shebang 指向别处的解释器（venv 搬过位置？）：\n  "
        + "\n  ".join(broken)
    )


def test_requirements_lock_matches_installed_packages():
    """requirements.lock.txt 必须与实际装的一致。

    lock 是「机器读的事实清单」，requirements.txt 是「人读的意图清单」（带 >=）。
    lock 过期了就失去意义 —— 照着它重建会得到一个和现在不一样的环境。
    """
    from importlib.metadata import distributions

    lock = BACKEND / "requirements.lock.txt"
    assert lock.exists(), "backend/requirements.lock.txt 不存在"

    pinned = {}
    for line in lock.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "==" not in line:
            continue
        name, version = line.split("==", 1)
        pinned[name.lower().replace("_", "-")] = version

    installed = {
        d.metadata["Name"].lower().replace("_", "-"): d.version
        for d in distributions() if d.metadata["Name"]
    }

    drift = [
        f"{name}: lock={version} 实际={installed.get(name, '未安装')}"
        for name, version in sorted(pinned.items())
        if installed.get(name) != version
    ]
    assert not drift, (
        "lock 与实际环境不一致：\n  " + "\n  ".join(drift)
        + "\n改依赖之后要重新冻结："
        "../.venv/bin/python -m pip freeze --exclude-editable > requirements.lock.txt"
    )

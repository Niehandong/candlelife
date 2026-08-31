"""把原型资源转换为小程序可用的网络资源与打包图标。

故事序列 4 张 PNG 合计 8.1MB，转 JPG 后可降到 1MB 以内；
tabBar 图标必须是 PNG（微信不支持 SVG）且单个 ≤40KB。
"""
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC_UI = ROOT / "prototype" / "image" / "zhusheng-sleep-ui"
SRC_STORY = ROOT / "prototype" / "image" / "zhusheng-story-sequence"
OUT = ROOT / "backend" / "static" / "ui"
TAB_OUT = ROOT / "miniprogram" / "src" / "assets" / "tab"

ROOMS = ["home-room", "prep-room", "quiet-room", "goodnight-room", "dawn-room"]

NAV_ICONS = [
    ("nav-home-on", "home-on"), ("nav-home-off", "home-off"),
    ("nav-home-off-c", "home-off-c"), ("nav-home-off-s", "home-off-s"),
    ("nav-journal-on", "journal-on"), ("nav-journal-off-dark", "journal-off-dark"),
    ("nav-journal-off-c", "journal-off-c"), ("nav-journal-off-s", "journal-off-s"),
    ("nav-collection-on", "collection-on"), ("nav-collection-off", "collection-off"),
    ("nav-collection-off-dark", "collection-off-dark"),
    ("nav-collection-off-s", "collection-off-s"),
    ("nav-settings-on", "settings-on"), ("nav-settings-off", "settings-off"),
    ("nav-settings-off-dark", "settings-off-dark"),
    ("nav-settings-off-c", "settings-off-c"),
]


def to_jpg(src: Path, dst: Path, max_edge: int, target_kb: int) -> int:
    im = Image.open(src).convert("RGB")
    im.thumbnail((max_edge, max_edge), Image.LANCZOS)
    q = 84
    while True:
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
        if dst.stat().st_size <= target_kb * 1024 or q <= 55:
            return dst.stat().st_size // 1024
        q -= 6


def convert_tab_icons() -> None:
    """SVG → 81×81 PNG。缺 cairosvg 时给出明确指引而非静默失败。"""
    try:
        import cairosvg
    except ImportError as exc:
        raise SystemExit(
            "缺少 cairosvg，无法转换 tabBar 图标。请先 pip install cairosvg，"
            "或用设计工具手动导出 81x81 PNG 到 miniprogram/src/assets/tab/"
        ) from exc

    TAB_OUT.mkdir(parents=True, exist_ok=True)
    for src_name, dst_name in NAV_ICONS:
        dst = TAB_OUT / f"{dst_name}.png"
        cairosvg.svg2png(url=str(SRC_UI / f"{src_name}.svg"), write_to=str(dst),
                         output_width=81, output_height=81)
        size = dst.stat().st_size
        # 用精确字节比较，不要先 //1024——整除会掩盖 40960~41983 字节区间的超标
        assert size <= 40 * 1024, f"{dst_name}.png {size} 字节超过微信 40KB 限制"
    print(f"  tabBar 图标 {len(NAV_ICONS)} 个已转换")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in ROOMS:
        kb = to_jpg(SRC_UI / f"{name}.jpg", OUT / f"{name}.jpg", 1080, 200)
        print(f"  {name}.jpg  {kb} KB")
        total += kb
    for src in sorted(SRC_STORY.glob("*.png")):
        dst = OUT / f"story-{src.stem.split('-')[0]}.jpg"
        kb = to_jpg(src, dst, 1080, 220)
        print(f"  {dst.name}  {kb} KB")
        total += kb
    shutil.copy2(SRC_UI / "zhusheng-prologue.mp4", OUT / "prologue.mp4")
    mp4_kb = (OUT / "prologue.mp4").stat().st_size // 1024
    print(f"  prologue.mp4  {mp4_kb} KB")
    convert_tab_icons()
    print(f"网络资源合计 {(total + mp4_kb) / 1024:.1f} MB")


if __name__ == "__main__":
    main()

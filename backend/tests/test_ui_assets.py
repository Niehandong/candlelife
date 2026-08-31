from pathlib import Path

STATIC_UI = Path(__file__).resolve().parents[1] / "static" / "ui"
TAB = Path(__file__).resolve().parents[2] / "miniprogram" / "src" / "assets" / "tab"

ROOMS = ["home-room", "prep-room", "quiet-room", "goodnight-room", "dawn-room"]


def test_room_backgrounds_exist_and_small():
    for name in ROOMS:
        p = STATIC_UI / f"{name}.jpg"
        assert p.exists(), f"缺 {p.name}"
        assert p.stat().st_size <= 220 * 1024, f"{p.name} 过大"


def test_story_frames_exist():
    frames = sorted(STATIC_UI.glob("story-*.jpg"))
    assert len(frames) >= 4
    for p in frames:
        assert p.stat().st_size <= 240 * 1024, f"{p.name} 过大"


def test_prologue_video_present():
    assert (STATIC_UI / "prologue.mp4").exists()


def test_tab_icons_within_wechat_limit():
    """微信 tabBar 图标上限 40KB，且不支持 SVG。"""
    icons = list(TAB.glob("*.png"))
    assert len(icons) == 16, f"应有 16 个 tabBar 图标，实际 {len(icons)}"
    for p in icons:
        assert p.stat().st_size <= 40 * 1024, f"{p.name} 超过 40KB"


def test_bundled_assets_fit_main_package():
    """打进主包的资源必须远小于 2MB 上限。"""
    total = sum(p.stat().st_size for p in TAB.glob("*.png"))
    assert total <= 600 * 1024, f"tabBar 图标合计 {total // 1024}KB，主包压力过大"

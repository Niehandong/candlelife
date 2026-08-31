from pathlib import Path

from PIL import Image

from scripts.art_seed_data import ART_SEED

REQUIRED = ("id", "title", "artist", "year", "thumbnail", "image", "alt", "source", "article")
STATIC = Path(__file__).resolve().parents[1] / "static"


def test_seed_has_ten_works():
    assert len(ART_SEED) == 10


def test_every_field_present_and_nonblank():
    for row in ART_SEED:
        for key in REQUIRED:
            assert key in row, f"{row.get('id')} 缺字段 {key}"
            assert isinstance(row[key], str) and row[key].strip(), \
                f"{row.get('id')} 的 {key} 为空"


def test_ids_unique():
    ids = [r["id"] for r in ART_SEED]
    assert len(ids) == len(set(ids))


def test_no_placeholder_source():
    """原型的 source 自带 TODO，上线前必须落实为确切出处。"""
    for row in ART_SEED:
        s = row["source"]
        assert "待" not in s, f"{row['id']} 的来源仍是占位符：{s}"
        assert "TODO" not in s.upper()
        assert "http" in s, f"{row['id']} 的来源应含可核查的链接"


def test_image_files_exist_and_sized():
    for row in ART_SEED:
        full, thumb = STATIC / row["image"], STATIC / row["thumbnail"]
        assert full.exists(), f"缺图片 {row['image']}"
        assert thumb.exists(), f"缺缩略图 {row['thumbnail']}"
        assert full.stat().st_size <= 450 * 1024, f"{row['id']} 高清图过大"
        assert thumb.stat().st_size <= 80 * 1024, f"{row['id']} 缩略图过大"


def test_images_are_valid_jpeg():
    for row in ART_SEED:
        for rel in (row["image"], row["thumbnail"]):
            with Image.open(STATIC / rel) as im:
                assert im.format == "JPEG", f"{rel} 不是 JPEG"
                assert max(im.size) <= 1600


def test_paths_are_relative_not_urls():
    """数据库只存相对路径，出口才拼 ASSET_BASE_URL。"""
    for row in ART_SEED:
        for key in ("image", "thumbnail"):
            assert not row[key].startswith(("http", "/")), \
                f"{row['id']} 的 {key} 不应是绝对路径或 URL"
            assert row[key].startswith("art/")


def test_article_length_reasonable():
    for row in ART_SEED:
        assert 40 <= len(row["article"]) <= 200, \
            f"{row['id']} 文章 {len(row['article'])} 字，超出 40–200 范围"


def test_alt_text_describes_image():
    """alt 用于无障碍与图片加载失败时的占位，须实质描述画面。"""
    for row in ART_SEED:
        assert len(row["alt"]) >= 15, f"{row['id']} 的 alt 过短"
        # alt 应能独立说明这是谁的什么作品：含艺术家姓名任一片段，或标题片段
        name_parts = [p for p in row["artist"].replace("（原作）", "").split("·") if len(p) >= 2]
        title_core = row["title"].strip("《》").split("：")[-1].split("·")[-1]
        assert any(p in row["alt"] for p in name_parts) or title_core[:2] in row["alt"], \
            f"{row['id']} 的 alt 未指明作者或作品"

"""schema 隔离的回归测试。

背景：本库的 public schema 属于另一个项目且有同名 users 表。
曾因 search_path 含 public 导致 drop_all 误删对方的表。
"""
from sqlalchemy import text

from app.core.db import make_engine


async def test_app_engine_search_path_excludes_public():
    eng = make_engine("zhusheng")
    try:
        async with eng.connect() as conn:
            sp = (await conn.execute(text("SHOW search_path"))).scalar_one()
            parts = {p.strip().strip('"') for p in sp.split(",")}
            assert "public" not in parts, f"应用连接的 search_path 含 public: {sp!r}"
            assert parts == {"zhusheng"}
    finally:
        await eng.dispose()


async def test_app_queries_never_reach_public_users(session):
    """本项目的 users 与 public.users 是两张不同的表，绝不可混淆。"""
    ours = (await session.execute(text(
        "select count(*) from information_schema.columns "
        "where table_schema=current_schema() and table_name='users' and column_name='openid'"
    ))).scalar_one()
    assert ours == 1, "本项目的 users 应有 openid 列"

    theirs = (await session.execute(text(
        "select count(*) from information_schema.columns "
        "where table_schema='public' and table_name='users' and column_name='hashed_password'"
    ))).scalar_one()
    assert theirs == 1, "另一个项目的 public.users 应完好存在（含 hashed_password 列）"


async def test_other_project_tables_intact(session):
    """另一个项目的 13 张表必须始终完好。"""
    expected = {
        "carousel_slides", "column_articles", "column_issues", "curation_photos",
        "curation_topics", "exhibition_reviews", "footprint_items", "moon_phases",
        "personal_bio", "photo_item_pages", "photo_items", "users", "zen_quotes",
    }
    rows = (await session.execute(text(
        "select table_name from information_schema.tables "
        "where table_schema='public' and table_type='BASE TABLE'"
    ))).scalars().all()
    missing = expected - set(rows)
    assert not missing, f"另一个项目的表缺失：{sorted(missing)}"

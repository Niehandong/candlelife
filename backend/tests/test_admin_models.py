import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import AdminUser, AppConfig

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_admin_user_defaults(session):
    a = AdminUser(username="alice", hashed_password="x")
    session.add(a)
    await session.flush()
    assert isinstance(a.id, uuid.UUID)
    assert a.is_active is True
    assert a.last_login_at is None
    assert a.created_at is not None


async def test_username_is_unique(session):
    session.add(AdminUser(username="bob", hashed_password="x"))
    await session.flush()
    session.add(AdminUser(username="bob", hashed_password="y"))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_app_config_holds_jsonb(session):
    session.add(AppConfig(id=1, data={"app": {"name": "烛生"}}, updated_by="alice"))
    await session.flush()
    row = (await session.execute(select(AppConfig))).scalar_one()
    assert row.data["app"]["name"] == "烛生"
    assert row.updated_by == "alice"


async def test_app_config_rejects_second_row(session):
    """「单行覆盖」这个决策由数据库 CHECK 落地，应用层写错也插不进第二行。"""
    session.add(AppConfig(id=1, data={}, updated_by="alice"))
    await session.flush()
    with pytest.raises(DBAPIError):
        await session.execute(
            text("INSERT INTO app_config (id, data, updated_by) "
                 "VALUES (2, '{}', 'bob')"))
        await session.flush()


async def test_admin_tables_are_in_project_schema(session):
    """两张新表必须落在项目 schema 里，不得漏进 public。"""
    for table in ("admin_users", "app_config"):
        found = (await session.execute(
            text("SELECT table_schema FROM information_schema.tables "
                 "WHERE table_name = :t"), {"t": table})).scalars().all()
        assert "public" not in found, f"{table} 出现在 public schema —— 那是另一个项目的地盘"

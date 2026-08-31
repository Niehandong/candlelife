"""admin password_changed_at

Revision ID: 9ccfc798e08d
Revises: 7c340846fddf
Create Date: 2026-08-31 16:31:00.305382
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9ccfc798e08d'
down_revision: Union[str, None] = '7c340846fddf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default=now()：已有行会被填成【当前时刻】，也就是说这次迁移之后，
    # 迁移前签发的所有管理 token 立刻失效、需要重新登录。这是刻意的 ——
    # 引入「改密即作废旧 token」这个机制时，把历史 token 一并清掉最干净。
    op.add_column(
        "admin_users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_column("admin_users", "password_changed_at")

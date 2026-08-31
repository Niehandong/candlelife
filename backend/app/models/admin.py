"""后台管理的两张表。

【不写 __table_args__ schema】本项目全部对象靠连接级 search_path 落到
zhusheng / zhusheng_test，模型层写死 schema 会让测试隔离失效。
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, SmallInteger, String, Text, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdminUser(Base, TimestampMixin):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)   # bcrypt
    # 停用而非删除：管理员离职后保留其 username，便于日后追溯 app_config.updated_by
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)
    # 改密时间。签发时刻早于它的 token 一律失效 —— 没有这一条，
    # 「我怀疑号被人用了所以改密码」这个主要场景根本没被解决：
    # 对方手上那张 8 小时的 token 照样能用。
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False)


class AppConfig(Base):
    """运营配置。单行覆盖，永远只有 id=1 这一行。

    CHECK (id = 1) 是「单行」这个产品决策的数据库级落地。用户明确选择了
    不做版本化，代价是改错不可逆；防线是保存前 diff 预览与手动导出快照。
    """

    __tablename__ = "app_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_app_config_single_row"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, server_default=text("1"))
    # JSONB 而非逐字段建列：配置有 42 个字段且会随产品增减，逐字段意味着
    # 每加一句文案就要一次迁移。列级类型约束由 Pydantic 在写入前补上。
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
        nullable=False)

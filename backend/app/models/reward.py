import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Reward(Base):
    __tablename__ = "rewards"
    __table_args__ = (Index("ix_reward_user_awarded", "user_id", "awarded_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    night_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("night_records.id", ondelete="CASCADE"), nullable=False)
    # RESTRICT：被收藏过的作品不可物理删除，只能下架或撤回
    art_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("art_works.id", ondelete="RESTRICT"), nullable=False)
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now())
    # 故意不加唯一约束：允许重复抽中同一幅

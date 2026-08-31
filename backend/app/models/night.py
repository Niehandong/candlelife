import uuid
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, Date, DateTime, ForeignKey, Index, Integer,
                        LargeBinary, SmallInteger, String, UniqueConstraint, text)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NightRecord(Base, TimestampMixin):
    __tablename__ = "night_records"
    __table_args__ = (
        # 幂等的根：并发请求下应用层判断挡不住，唯一索引挡得住
        UniqueConstraint("user_id", "ritual_date", name="uq_night_user_date"),
        Index("ix_night_user_date", "user_id", "ritual_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ritual_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # 历史固化：判定在发生当时写入，任何查询不得重算
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    resistance_reason: Mapped[str | None] = mapped_column(String(128))
    gratitudes_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    plans_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    reward_revealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reward_draw_count: Mapped[int | None] = mapped_column(SmallInteger)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    # 严禁写入 gratitudes / plans / openid 等，schema 层已拦截
    payload: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

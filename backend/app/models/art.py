from sqlalchemy import Boolean, CheckConstraint, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

_NONBLANK = " AND ".join(
    f"length(btrim({c})) > 0"
    for c in ("title", "artist", "year", "thumbnail", "image", "alt", "source", "article")
)


class ArtWork(Base, TimestampMixin):
    __tablename__ = "art_works"
    __table_args__ = (CheckConstraint(_NONBLANK, name="ck_art_required_nonblank"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)        # slug
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    artist: Mapped[str] = mapped_column(String(128), nullable=False)
    year: Mapped[str] = mapped_column(String(64), nullable=False)
    thumbnail: Mapped[str] = mapped_column(String(256), nullable=False)  # 相对路径
    image: Mapped[str] = mapped_column(String(256), nullable=False)      # 相对路径
    alt: Mapped[str] = mapped_column(String(256), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    article: Mapped[str] = mapped_column(Text, nullable=False)
    # 下架：不进抽卡池，已收藏用户仍可见
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    # 撤回：不进抽卡池，已收藏用户也不可见（版权等法务原因）
    is_withdrawn: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"))

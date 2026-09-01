"""图片 URL 拼装。

数据库只存相对路径，出口才拼 ASSET_BASE_URL——迁到对象存储时
只改环境变量，数据库一行不动。
"""

from app.core.config import get_settings
from app.models import ArtWork
from app.schemas.art import ArtBrief


def asset_url(relative_path: str) -> str:
    return f"{get_settings().asset_base_url.rstrip('/')}/{relative_path.lstrip('/')}"


def art_brief(art: ArtWork) -> ArtBrief:
    return ArtBrief(id=art.id, title=art.title, artist=art.artist, year=art.year,
                    thumbnail=asset_url(art.thumbnail), image=asset_url(art.image), alt=art.alt)

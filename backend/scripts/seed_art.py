"""灌入艺术作品。幂等：重复执行只更新元数据，不重复插入。

刻意不覆写 is_active / is_withdrawn——那是运营的上下架决定，
不该被一次 seed 重置。
"""
import asyncio

from sqlalchemy.dialects.postgresql import insert

from app.core.db import SessionFactory
from app.models import ArtWork
from scripts.art_seed_data import ART_SEED


async def seed() -> int:
    async with SessionFactory() as session:
        for row in ART_SEED:
            stmt = insert(ArtWork).values(**row)
            await session.execute(stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={k: stmt.excluded[k] for k in row if k != "id"}))
        await session.commit()
    return len(ART_SEED)


if __name__ == "__main__":
    print(f"已灌入 {asyncio.run(seed())} 幅作品")

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ArtWork, Reward


async def active_pool(session: AsyncSession) -> list[ArtWork]:
    """抽卡池：已上架且未撤回。"""
    return list(await session.scalars(
        select(ArtWork)
        .where(ArtWork.is_active.is_(True), ArtWork.is_withdrawn.is_(False))
        .order_by(ArtWork.id)))


async def get_visible(session: AsyncSession, art_id: str) -> ArtWork | None:
    """已收藏用户可读：下架仍可见，撤回不可见。"""
    art = await session.get(ArtWork, art_id)
    return None if art is None or art.is_withdrawn else art


async def get_visible_many(session: AsyncSession,
                           art_ids: list[str]) -> dict[str, ArtWork]:
    """一次取回多幅可见作品，返回 {art_id: ArtWork}。

    收藏页原先在路由里循环调 get_visible()，收藏 20 幅就查 20 次
    —— 与后台作品列表已经修过的那个 N+1 是同一个错。

    撤回的作品不在结果里（与 get_visible 一致），调用方按「取不到就跳过」处理。
    """
    if not art_ids:
        return {}
    rows = await session.scalars(
        select(ArtWork).where(ArtWork.id.in_(art_ids),
                              ArtWork.is_withdrawn.is_(False)))
    return {a.id: a for a in rows}


def _admin_filters(stmt, status: str | None, q: str | None):
    """后台列表的筛选条件。列表与计数必须用同一份，否则 total 与 items 不一致。"""
    if status == "active":
        stmt = stmt.where(ArtWork.is_active.is_(True), ArtWork.is_withdrawn.is_(False))
    elif status == "inactive":
        stmt = stmt.where(ArtWork.is_active.is_(False), ArtWork.is_withdrawn.is_(False))
    elif status == "withdrawn":
        stmt = stmt.where(ArtWork.is_withdrawn.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(ArtWork.title.ilike(like), ArtWork.artist.ilike(like),
                              ArtWork.id.ilike(like)))
    return stmt


async def list_for_admin(session: AsyncSession, status: str | None = None,
                         q: str | None = None, limit: int | None = None,
                         offset: int = 0) -> list[ArtWork]:
    """后台列表：含下架与撤回。status ∈ {active, inactive, withdrawn, None}。

    order_by(ArtWork.id) 不只是为了好看：分页必须有确定的排序，否则翻页会
    重复或漏项（PostgreSQL 不保证无序查询两次返回同样的顺序）。
    """
    stmt = _admin_filters(select(ArtWork), status, q).order_by(ArtWork.id)
    if limit is not None:
        stmt = stmt.limit(limit).offset(offset)
    return list(await session.scalars(stmt))


async def count_for_admin(session: AsyncSession, status: str | None = None,
                          q: str | None = None) -> int:
    """符合筛选条件的总数（不分页），用来算总页数。"""
    stmt = _admin_filters(select(func.count()).select_from(ArtWork), status, q)
    return await session.scalar(stmt) or 0


async def count_rewards_for(session: AsyncSession, art_id: str) -> int:
    """这幅作品被收藏了多少次。删除前的快速检查用它。"""
    return await session.scalar(
        select(func.count()).select_from(Reward).where(Reward.art_id == art_id)) or 0


async def reward_counts_for(session: AsyncSession,
                            art_ids: list[str]) -> dict[str, int]:
    """一次查出多幅作品各自的收藏数。

    列表页原来是每条单独查一次（N+1）。分页后每页最多 100 条，仍然是 100 次
    往返；一条 GROUP BY 就够。没被收藏过的作品不会出现在结果里，调用方用
    .get(id, 0)。
    """
    if not art_ids:
        return {}
    rows = await session.execute(
        select(Reward.art_id, func.count())
        .where(Reward.art_id.in_(art_ids))
        .group_by(Reward.art_id))
    return {art_id: n for art_id, n in rows}

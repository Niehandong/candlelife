import secrets
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import ritual as domain
from app.models import Reward, UserSettings
from app.repositories import art as art_repo
from app.repositories import night as night_repo
from app.repositories import reward as reward_repo

# 奖励有价值，随机源用 SystemRandom 而非可预测的 random
_rng = secrets.SystemRandom()


class RewardService:
    async def reveal_all(self, session: AsyncSession, user_id: uuid.UUID,
                         now: datetime) -> list[tuple[Reward, "date"]]:
        """一次揭晓全部已到窗口的夜记（用户可能数日未打开）。"""
        s: UserSettings = await session.get(UserSettings, user_id)
        pool = await art_repo.active_pool(session)
        created: list[tuple[Reward, object]] = []

        for night in await reward_repo.pending_nights(session, user_id, lock=True):
            if not domain.can_reveal(ritual_date=night.ritual_date,
                                     is_eligible=night.is_eligible,
                                     reward_revealed_at=night.reward_revealed_at,
                                     now=now, tz=s.timezone):
                continue
            if not pool:
                continue

            # ★ 用「该仪式夜当时」的连续天数，不是揭晓时刻的。
            # 否则用户断签后补揭晓会凭空少拿抽卡。
            history = await night_repo.list_eligibility(session, user_id, night.ritual_date)
            streak = domain.calculate_on_time_streak(history, night.ritual_date)
            draws = domain.reward_draw_count(streak)

            for _ in range(draws):
                art = _rng.choice(pool)          # 允许重复抽中同一幅
                reward = Reward(user_id=user_id, night_record_id=night.id, art_id=art.id)
                session.add(reward)
                created.append((reward, night.ritual_date))

            night.reward_revealed_at = now
            night.reward_draw_count = draws

        await session.commit()
        return created

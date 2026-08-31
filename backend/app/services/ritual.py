import uuid
from dataclasses import dataclass
from datetime import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_list
from app.domain import ritual as domain
from app.models import UserSettings
from app.repositories import night as night_repo
from app.schemas.night import CompleteRequest


@dataclass(frozen=True)
class RitualConfig:
    tolerance_minutes: int = 30
    min_time: time = time(20, 0)
    max_time: time = time(2, 0)


class RitualService:
    async def complete(self, session: AsyncSession, user_id: uuid.UUID,
                       body: CompleteRequest, config: RitualConfig):
        s: UserSettings = await session.get(UserSettings, user_id)

        # 服务端权威：用用户设置重算，不接受客户端任何判定结果
        assessment = domain.evaluate_completion(
            planned_time=s.bedtime,
            completed_at=body.completed_at,
            tz=s.timezone,
            tolerance_minutes=config.tolerance_minutes,
            min_time=config.min_time,
            max_time=config.max_time,
        )

        await night_repo.insert_if_absent(session, {
            "user_id": user_id,
            "ritual_date": assessment.ritual_date,
            "planned_at": assessment.planned_at,
            "completed_at": assessment.completed_at,
            "late_minutes": assessment.late_minutes,
            "is_eligible": assessment.eligible,
            "resistance_reason": body.resistance_reason,
            "gratitudes_enc": encrypt_list(body.gratitudes),
            "plans_enc": encrypt_list(body.plans),
        })
        await session.commit()

        record = await night_repo.get(session, user_id, assessment.ritual_date)
        history = await night_repo.list_eligibility(session, user_id, record.ritual_date)
        streak = domain.calculate_on_time_streak(history, record.ritual_date)
        return record, streak

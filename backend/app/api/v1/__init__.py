from fastapi import APIRouter

from app.api.v1 import art, auth, config, events, me, nights, rewards
from app.api.v1.admin import admin_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(nights.router)
api_router.include_router(rewards.router)
api_router.include_router(art.router)
api_router.include_router(config.router)
api_router.include_router(events.router)
api_router.include_router(admin_router)

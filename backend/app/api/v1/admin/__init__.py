from fastapi import APIRouter

from app.api.v1.admin import art, auth, config

admin_router = APIRouter(prefix="/admin")
admin_router.include_router(auth.router)
admin_router.include_router(config.router)
admin_router.include_router(art.router)

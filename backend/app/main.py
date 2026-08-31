from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.errors import register_exception_handlers


def create_app() -> FastAPI:
    settings = get_settings()          # 配置非法时在此抛错，进程拒绝启动
    app = FastAPI(title="烛生 API", version="0.1.0")

    register_exception_handlers(app)

    # 默认假定 admin 与 API 同源（Nginx 把 /api 反代到后端），不开 CORS。
    # 分域名部署时设 ADMIN_CORS_ORIGINS，不需改代码。
    origins = settings.admin_cors_origin_list
    if origins:
        from fastapi.middleware.cors import CORSMiddleware
        # allow_credentials=False 是刻意的：token 走 Authorization 头，不用 cookie，
        # 因此不需要携带凭证的跨域，也就避开了 allow_origins=* + credentials 的经典漏洞。
        app.add_middleware(
            CORSMiddleware, allow_origins=origins, allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"])

    from app.api.v1 import api_router
    app.include_router(api_router)

    # 开发期图片托管；上线后改 ASSET_BASE_URL 指向对象存储即可，数据库不动
    static_dir = Path(__file__).resolve().parent.parent / "static"
    static_dir.mkdir(exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/health")
    async def health():
        return {"status": "ok", "env": settings.env}

    return app


app = create_app()

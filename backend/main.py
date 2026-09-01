"""Development entry point for the Zhusheng backend."""

import os
from pathlib import Path

import uvicorn


ROOT = Path(__file__).resolve().parent


def main() -> None:
    """Run the FastAPI application with development-friendly defaults."""
    os.chdir(ROOT)
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8010"))
    reload_enabled = os.getenv("RELOAD", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload_enabled,
        # 关掉 uvicorn 自带的 access log：/api 下 HTTP 状态一律 200，
        # 那行对成功和失败打印的东西一模一样，没有信息量。
        # 改用 app/core/logging.py 的 AccessLogMiddleware，它带业务码。
        access_log=False,
    )


if __name__ == "__main__":
    main()

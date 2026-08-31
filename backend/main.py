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
    )


if __name__ == "__main__":
    main()

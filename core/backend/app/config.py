import os
import sys
from pathlib import Path


def _local_app_data_dir() -> Path:
    """
    Cross-platform per-user app-data folder, so the SQLite file lives
    somewhere stable and writable regardless of where the packaged desktop
    binary is launched from (never the current working directory — that's
    not reliable once this runs as a bundled Tauri sidecar).
    """
    name = "KitchenOS"
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library" / "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))
    path = Path(base) / name
    path.mkdir(parents=True, exist_ok=True)
    return path


# DESKTOP_FREE_BUILD is set by the Tauri sidecar launcher (see run_sidecar.py).
# It exists to make Hard Rule 1 (zero free cloud cost / no liability for free
# user data) a code-level guarantee, not just a default: even if a stray
# SENTRY_DSN or DATABASE_URL env var were present on a user's machine, the
# free desktop build refuses to use them.
IS_DESKTOP_FREE_BUILD = os.environ.get("DESKTOP_FREE_BUILD", "1") == "1"


class Config:
    if IS_DESKTOP_FREE_BUILD:
        # Free tier: always local SQLite, always in the per-user app-data
        # folder. DATABASE_URL is intentionally ignored here — a free build
        # must never be pointed at a shared/cloud Postgres instance.
        SQLALCHEMY_DATABASE_URI = "sqlite:///" + str(_local_app_data_dir() / "kitchenos.db")
        # Recipe photos etc. live next to the DB file, same per-user folder —
        # never a cloud bucket, for the same zero-free-cloud-cost reason.
        UPLOAD_DIR = str(_local_app_data_dir() / "uploads")
    else:
        SQLALCHEMY_DATABASE_URI = os.environ.get(
            "DATABASE_URL", "sqlite:///kitchenos.db"
        )
        UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "instance/uploads")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-change-me")
    if not IS_DESKTOP_FREE_BUILD and JWT_SECRET_KEY == "dev-secret-change-me":
        # Fail closed: a server/cloud deployment must never run with the
        # well-known dev secret. Set JWT_SECRET_KEY explicitly.
        raise RuntimeError(
            "JWT_SECRET_KEY must be set to a real secret when DESKTOP_FREE_BUILD=0 "
            "(the dev default 'dev-secret-change-me' is not allowed outside the free desktop build)."
        )
    JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 8       # 8 hours
    JWT_REFRESH_TOKEN_EXPIRES = 60 * 60 * 24 * 30  # 30 days

    AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.groq.com/openai/v1")
    AI_API_KEY = os.environ.get("AI_API_KEY", "")
    AI_MODEL = os.environ.get("AI_MODEL", "llama-3.3-70b-versatile")
    # Applied per-route in app/ai.py — AI calls cost money/quota so they get
    # their own (stricter) limit than the rest of the API.
    AI_RATE_LIMIT = os.environ.get("AI_RATE_LIMIT", "20 per hour")

    # Optional error monitoring. Works with Sentry or a self-hosted GlitchTip
    # instance (GlitchTip speaks the Sentry protocol). Leave unset to disable —
    # sentry_sdk.init() is simply never called (see app/__init__.py).
    # Hard-disabled on the free desktop build regardless of env var: a free
    # user's local data must never leave their machine without an explicit
    # premium action, and telemetry is exactly the kind of accidental network
    # call Hard Rule 1 is meant to prevent.
    SENTRY_DSN = "" if IS_DESKTOP_FREE_BUILD else os.environ.get("SENTRY_DSN", "")

    # CORS is restricted to the origins a Tauri webview actually uses, plus
    # the Vite dev server port, instead of flask-cors's wide-open default —
    # this is a local sidecar bound to 127.0.0.1, not a public API, so there's
    # no reason any other origin should be able to call it.
    CORS_ORIGINS = os.environ.get(
        "CORS_ORIGINS",
        "tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:5173",
    ).split(",")

    # Applies to every request, not just uploads — but recipe photos (see
    # app/uploads.py) are the only thing in this app that could plausibly
    # send a large body, so this is really an image-upload size cap in
    # practice. 8MB is generous for a phone photo and small enough that a
    # user can't accidentally fill their disk one recipe at a time.
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024

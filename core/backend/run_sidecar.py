"""
Entrypoint for the desktop build. Tauri's Rust shell spawns this as a
sidecar process on app launch and kills it on app exit (see
desktop/src-tauri/src/main.rs) — the user never sees a terminal or knows
Python is involved.

Not app.run() / not gunicorn: this needs to work identically once frozen
into a single executable with PyInstaller for Windows/macOS/Linux, and
needs to survive being launched with no shell, no TTY, and an unpredictable
working directory. waitress handles all of that; app.run()'s dev server
explicitly warns against exactly this use case.

DESKTOP_FREE_BUILD is set (not just defaulted) here, so config.py's
Postgres/Sentry lockout applies unconditionally in the packaged app,
regardless of what's in the end user's environment variables.
"""
import os

os.environ["DESKTOP_FREE_BUILD"] = "1"

import sys  # noqa: E402

if getattr(sys, "frozen", False):
    # PyInstaller extracts bundled data files (see desktop/README.md's
    # --add-data step for the whisper model) into this temp dir at
    # startup — the model ships inside the executable rather than being
    # downloaded on first use, which would be exactly the kind of surprise
    # network call the free tier isn't supposed to make. setdefault so a
    # real dev-machine override still wins if one's already set.
    os.environ.setdefault(
        "KITCHENOS_WHISPER_MODEL_PATH",
        os.path.join(sys._MEIPASS, "models", "small"),
    )

from waitress import serve  # noqa: E402 — must follow the env var above
from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.db_upgrade import sync_sqlite_schema  # noqa: E402
from app.bootstrap import ensure_default_locations  # noqa: E402

PORT = int(os.environ.get("KITCHENOS_PORT", "51872"))  # arbitrary fixed local port

app = create_app()

with app.app_context():
    # No Flask-Migrate/Alembic step for the free build: this is a fresh
    # per-user SQLite file, so create_all() is sufficient and avoids
    # shipping the migrations/ package (and its own moving parts) inside
    # the frozen executable. Alembic migrations still matter for anyone
    # running this app the old (web/Postgres) way — untouched.
    db.create_all()
    # create_all() only creates missing tables — an upgrading user's
    # existing SQLite file still needs new *columns* added by hand. See
    # app/db_upgrade.py for what this does and doesn't cover.
    sync_sqlite_schema(db)
    # Column exists now, but an upgrading user's existing inventory rows
    # still have location_id = NULL until this assigns them to a default
    # location (creating one first if the org predates this feature).
    ensure_default_locations(db)

if __name__ == "__main__":
    print(f"KitchenOS local server listening on http://127.0.0.1:{PORT}")
    serve(app, host="127.0.0.1", port=PORT)

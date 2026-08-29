from flask import Flask, jsonify
from .config import Config
from .extensions import db, migrate, jwt, cors, limiter
from . import models  # noqa: F401 — ensures models are registered before migrations
from .auth import bp as auth_bp
from .ai import bp as ai_bp
from .resources import ALL_BLUEPRINTS
from .reports import bp as reports_bp
from .workflow import ALL_WORKFLOW_BLUEPRINTS
from .migration import bp as migration_bp
from .uploads import bp as uploads_bp
from .voice import bp as voice_bp


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Optional error monitoring (Sentry or self-hosted GlitchTip). Only turns
    # on if SENTRY_DSN is set, so this is a no-op in dev/CI by default.
    if app.config.get("SENTRY_DSN"):
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        sentry_sdk.init(dsn=app.config["SENTRY_DSN"], integrations=[FlaskIntegration()])

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, origins=app.config.get("CORS_ORIGINS", "*"))
    limiter.init_app(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(migration_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(voice_bp)
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)
    for bp in ALL_WORKFLOW_BLUEPRINTS:
        app.register_blueprint(bp)

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"})

    return app

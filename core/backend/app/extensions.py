from sqlalchemy import MetaData
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Named constraints so Alembic's autogenerate can actually name the
# constraints it adds — required for SQLite's batch/ALTER-TABLE emulation
# to work on migrations that add a foreign key (see migrations/versions).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

db = SQLAlchemy(metadata=MetaData(naming_convention=NAMING_CONVENTION))
migrate = Migrate()
jwt = JWTManager()
cors = CORS()

# Keyed by IP address. AI routes are the ones that actually cost money/quota,
# so they get an explicit stricter limit applied where they're defined (see
# app/ai.py); this default is just a safety net for everything else.
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per hour"])

from __future__ import annotations

from pathlib import Path

from sqlalchemy import inspect

from alembic import command
from alembic.config import Config
from app.core.database import database_url, get_engine, init_db

BACKEND_ROOT = Path(__file__).resolve().parents[2]
HEAD_REVISION = "20260715_01"


def alembic_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option(
        "sqlalchemy.url",
        database_url().render_as_string(hide_password=False).replace("%", "%%"),
    )
    return config


def upgrade_database() -> None:
    config = alembic_config()
    tables = set(inspect(get_engine()).get_table_names())
    if tables and "alembic_version" not in tables:
        # Compatibility bridge for databases created by releases that called
        # init_db() directly. Bring that schema up to the last legacy shape,
        # then let all subsequent changes flow through Alembic revisions.
        init_db()
        command.stamp(config, HEAD_REVISION)
        return
    command.upgrade(config, "head")

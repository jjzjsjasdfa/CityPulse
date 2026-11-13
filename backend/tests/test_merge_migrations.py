"""Both previously independent migration heads must upgrade without touching public data."""

import os
from contextlib import nullcontext
from types import SimpleNamespace
from uuid import uuid4

import pytest
import sqlalchemy
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.core.config import settings


def test_single_migration_head():
    script = ScriptDirectory.from_config(Config("alembic.ini"))
    assert script.get_heads() == ["20261112_0012"]


@pytest.mark.skipif(os.getenv("CITYPULSE_TEST_POSTGRES") != "1", reason="PostGIS integration")
@pytest.mark.parametrize("previous", ["base", "20260922_0009", "20260918_0011"])
def test_upgrade_both_branches_in_isolated_schema(monkeypatch, previous):
    engine = create_engine(settings.database_url)
    schema = "test_merge_" + uuid4().hex
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
            # Shadow public.alembic_version so Alembic cannot use the application's version.
            connection.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
            monkeypatch.setattr(sqlalchemy, "engine_from_config", lambda *a, **k:
                                SimpleNamespace(connect=lambda: nullcontext(connection)))
            config = Config("alembic.ini")
            if previous != "base":
                command.upgrade(config, previous)
            command.upgrade(config, "head")
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20261112_0012"
            tables = set(inspect(connection).get_table_names(schema=schema))
            assert {"user_revisions", "poster_submissions", "entries", "favorites", "nickname_changes"} <= tables
            columns = {c["name"] for c in inspect(connection).get_columns("events", schema=schema)}
            assert "archived_at" in columns and "is_demo" not in columns
        finally:
            transaction.rollback()
    engine.dispose()

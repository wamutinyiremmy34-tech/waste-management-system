"""
Unit tests for the MIGRATION_DATABASE_URL / DATABASE_URL selection logic.

No real database connection is opened.  The tests cover:
  1. The URL-selection rule (same expression as in migrations/env.py).
  2. That Settings.MIGRATION_DATABASE_URL is declared as an optional field.
  3. That migrations/env.py passes the correct URL to alembic's set_main_option.
"""
import importlib.util
import os
import sys
import types
import unittest.mock as mock

import pytest

# ---------------------------------------------------------------------------
# Fixture overrides are in tests/unit/conftest.py — no DB fixtures run here.
# ---------------------------------------------------------------------------

APP_URL   = "postgresql+psycopg2://ecotrack_app:apppw@host/db"
OWNER_URL = "postgresql+psycopg2://ecotrack_owner:ownerpw@host/db"
DEV_URL   = "postgresql+psycopg2://ecotrack:devpw@localhost:5432/ecotrack_dev"


# ---------------------------------------------------------------------------
# 1. URL selection rule
#    Mirrors the exact expression in migrations/env.py:
#        _migration_url = settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL
# ---------------------------------------------------------------------------

def _select(database_url: str, migration_database_url: str | None) -> str:
    """The selection rule from migrations/env.py, extracted for unit testing."""
    return migration_database_url or database_url


class TestUrlSelectionRule:
    def test_uses_migration_url_when_set(self):
        assert _select(APP_URL, OWNER_URL) == OWNER_URL

    def test_falls_back_to_database_url_when_migration_url_is_none(self):
        assert _select(APP_URL, None) == APP_URL

    def test_falls_back_when_migration_url_is_empty_string(self):
        # Empty string is falsy — behaves the same as None (unset).
        assert _select(APP_URL, "") == APP_URL

    def test_app_url_not_used_for_migrations_when_owner_url_set(self):
        result = _select(APP_URL, OWNER_URL)
        assert result != APP_URL, "Alembic must not run as the restricted app role"

    def test_dev_single_url_works(self):
        """Local dev: one superuser URL covers both roles."""
        assert _select(DEV_URL, None) == DEV_URL


# ---------------------------------------------------------------------------
# 2. Settings field declaration
#    Does NOT instantiate Settings (avoids .env loading and any network I/O).
#    Inspects the pydantic v2 model_fields metadata instead.
# ---------------------------------------------------------------------------

class TestSettingsFieldDeclaration:
    """MIGRATION_DATABASE_URL must be declared as an optional field."""

    def test_migration_url_field_exists(self):
        from app.core.config import Settings
        assert "MIGRATION_DATABASE_URL" in Settings.model_fields

    def test_migration_url_field_defaults_to_none(self):
        from app.core.config import Settings
        field = Settings.model_fields["MIGRATION_DATABASE_URL"]
        # pydantic v2 stores the default on FieldInfo.
        assert field.default is None, (
            "MIGRATION_DATABASE_URL must default to None so that development "
            "environments without it configured still work."
        )

    def test_database_url_field_exists(self):
        from app.core.config import Settings
        assert "DATABASE_URL" in Settings.model_fields

    def test_database_url_has_a_non_none_default(self):
        from app.core.config import Settings
        field = Settings.model_fields["DATABASE_URL"]
        assert field.default is not None


# ---------------------------------------------------------------------------
# 3. migrations/env.py wiring
#    Loads the file with all DB/network pieces stubbed out so no Postgres
#    connection is attempted.
# ---------------------------------------------------------------------------

def _load_env_py(migration_url=None, database_url=APP_URL) -> dict:
    """
    Execute migrations/env.py in isolation, returning the dict of
    recorded alembic config.set_main_option calls.

    Stubs replaced:
      - alembic.context  (records set_main_option; prevents real DB call)
      - geoalchemy2       (C extension not needed in unit tests)
      - sqlalchemy engine (prevents connection on engine_from_config)
      - app.core.config.settings  (controlled fake)
      - app.core.database.Base    (not needed)
      - app.models                (not needed)
    """
    recorded: dict[str, str] = {}

    class _StubConfig:
        config_file_name = None
        config_ini_section = "alembic"

        def set_main_option(self, key: str, value: str) -> None:
            recorded[key] = value

        def get_main_option(self, key: str):
            return recorded.get(key)

        def get_section(self, section, default=None):
            return default or {}

    stub_config = _StubConfig()

    # Minimal context stub — prevent real online migration from running.
    _cm = mock.MagicMock()
    _cm.__enter__ = lambda s: s
    _cm.__exit__ = mock.MagicMock(return_value=False)

    stub_context = types.ModuleType("alembic_context_stub")
    stub_context.config = stub_config
    stub_context.is_offline_mode = lambda: False
    stub_context.configure = lambda **kw: None
    stub_context.begin_transaction = mock.MagicMock(return_value=_cm)
    stub_context.run_migrations = lambda: None

    stub_alembic_pkg = types.ModuleType("alembic")
    stub_alembic_pkg.context = stub_context

    stub_geo   = types.ModuleType("geoalchemy2")
    stub_pool  = types.ModuleType("sqlalchemy.pool")
    stub_pool.NullPool = None
    stub_sa    = types.ModuleType("sqlalchemy")
    stub_sa.engine_from_config = lambda *a, **kw: mock.MagicMock()
    stub_sa.pool = stub_pool

    fake_settings = mock.MagicMock()
    fake_settings.DATABASE_URL = database_url
    fake_settings.MIGRATION_DATABASE_URL = migration_url

    env_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "migrations", "env.py")
    )

    module_overrides = {
        "alembic": stub_alembic_pkg,
        "alembic.context": stub_context,
        "geoalchemy2": stub_geo,
        "sqlalchemy": stub_sa,
        "sqlalchemy.pool": stub_pool,
    }
    sys.modules.setdefault("app.models", mock.MagicMock())

    with mock.patch.dict(sys.modules, module_overrides):
        with mock.patch("app.core.config.settings", fake_settings):
            with mock.patch("app.core.database.Base", mock.MagicMock()):
                spec = importlib.util.spec_from_file_location(
                    "_env_py_under_test", env_path
                )
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)

    return recorded


class TestEnvPyWiring:
    def test_uses_owner_url_when_migration_url_set(self):
        recorded = _load_env_py(migration_url=OWNER_URL, database_url=APP_URL)
        assert recorded.get("sqlalchemy.url") == OWNER_URL

    def test_falls_back_to_database_url_when_migration_url_absent(self):
        recorded = _load_env_py(migration_url=None, database_url=APP_URL)
        assert recorded.get("sqlalchemy.url") == APP_URL

    def test_does_not_use_app_url_when_owner_url_available(self):
        recorded = _load_env_py(migration_url=OWNER_URL, database_url=APP_URL)
        assert recorded.get("sqlalchemy.url") == OWNER_URL

    def test_dev_fallback_single_url(self):
        """When no MIGRATION_DATABASE_URL is set, DEV_URL is used for both."""
        recorded = _load_env_py(migration_url=None, database_url=DEV_URL)
        assert recorded.get("sqlalchemy.url") == DEV_URL
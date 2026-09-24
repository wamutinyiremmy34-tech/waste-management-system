"""
Conftest for unit tests that require no database connection.

The parent tests/conftest.py declares setup_database and clean_tables as
autouse session/function fixtures that connect to Postgres.  That is correct
for integration tests, but unit tests in this subdirectory must not trigger
any database I/O.

We override both fixtures here with no-op stubs so pytest never calls the
parent fixtures for tests collected from this directory.
"""
import pytest


@pytest.fixture(scope="session", autouse=True)
def setup_database():  # noqa: F811 — intentional override of parent fixture
    """No-op: unit tests in this directory need no database."""
    yield


@pytest.fixture(autouse=True)
def clean_tables():  # noqa: F811 — intentional override of parent fixture
    """No-op: unit tests in this directory need no database."""
    yield

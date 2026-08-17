import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

TEST_DATABASE_URL = "postgresql+psycopg2://ecotrack:ecotrack_dev_pw@localhost:5432/ecotrack_test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["APP_ENV"] = "testing"

from app.core.database import Base, get_db
from app.core.rls import ALL_STATEMENTS
from app.main import app

engine = create_engine(TEST_DATABASE_URL, future=True)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()
    import app.models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # Apply the same RLS role/policy DDL the real migration ships (see
    # app/core/rls.py) — the test DB's schema is built via
    # Base.metadata.create_all(), not Alembic, so this needs to run
    # separately here for RLS to actually be exercised by
    # test_row_level_security.py. Run as the superuser connection (which is
    # what `engine` uses), since CREATE ROLE requires that privilege.
    with engine.connect() as conn:
        for statement in ALL_STATEMENTS:
            conn.execute(text(statement))
        conn.commit()

    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def clean_tables():
    """Truncate all app tables before every test so tests are independent."""
    with engine.connect() as conn:
        tables = [t.name for t in reversed(Base.metadata.sorted_tables)]
        conn.execute(text(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"))
        conn.commit()
    yield


@pytest.fixture()
def db_session():
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture()
def client():
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def register_and_login(client, email, password="Passw0rd123", role="CITIZEN", full_name="Test User"):
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name, "role": role},
    )
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]

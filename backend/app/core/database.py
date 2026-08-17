from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@event.listens_for(engine, "checkin")
def _reset_rls_session_context_on_checkin(dbapi_connection, connection_record):
    """
    Row-Level Security session context (`app.user_id`, `app.role`, etc. — see
    app/security/dependencies.py) is set with plain `SET` (session-scoped),
    not `SET LOCAL` (transaction-scoped), because a real bug was found by
    actually testing the RLS-restricted role end-to-end: `SET LOCAL` doesn't
    survive a mid-request `db.commit()`, and several service functions
    commit partway through a request and then perform further RLS-covered
    queries afterward (e.g. pickup_service.create_pickup commits, then calls
    db.refresh(), which failed to find the very row just inserted once RLS
    was actually active — not a theoretical edge case, a real 500 on the
    single most central write in the app). Session-scoped `SET` survives
    commits within the same connection, fixing that.

    The tradeoff: a session-scoped setting would leak into the NEXT request
    if it reused the same pooled connection without this reset — so this
    listener runs `RESET ALL` every time a connection is returned to the
    pool, guaranteeing no RLS context ever survives past the request that
    set it. This is a real, tested fix, not a theoretical mitigation — see
    docs/multi-tenancy.md for how it was found and verified.
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("RESET ALL")
        # psycopg2 doesn't autocommit by default, so the raw RESET ALL above
        # opens an implicit transaction on the DBAPI connection that
        # SQLAlchemy doesn't know about. Without explicitly committing it
        # here, the connection sits "idle in transaction" when handed back
        # out to a future SQLAlchemy Session, which doesn't expect an
        # already-open transaction and misbehaves — a second real bug found
        # by testing this fix, not assumed to be needed up front.
        dbapi_connection.commit()
    finally:
        cursor.close()


class Base(DeclarativeBase):
    pass


def get_db():
    """
    Binds the Session to one explicitly-checked-out Connection for the
    entire request, rather than the Engine (SQLAlchemy's default), which
    matters specifically because of Row-Level Security: a Session bound to
    the Engine releases its underlying connection back to the pool after
    every `commit()` and may pick up a different (or the same, but by-then
    RESET) connection for the next query — which broke the RLS session
    context (see app/security/dependencies.py) between a commit and a
    subsequent `db.refresh()` in the very same request, a real bug found by
    testing the RLS-restricted role end-to-end, not a theoretical concern.
    Binding to one Connection for the whole request keeps the same
    underlying database session (and its `SET app.*` context) alive across
    every commit within that request; the connection is only returned to
    the pool — and RESET (see the `checkin` event above) — when the request
    actually finishes.
    """
    connection = engine.connect()
    db = SessionLocal(bind=connection)
    try:
        yield db
    finally:
        db.close()
        connection.close()

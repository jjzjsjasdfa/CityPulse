"""Accounts, revocable sessions and candidate publication audit."""

from alembic import op

revision = "20260912_0005"
down_revision = "20260912_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE users (
            id UUID PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE,
            password_hash VARCHAR(256) NOT NULL,
            role VARCHAR(16) NOT NULL CHECK (role IN ('regular', 'admin')),
            is_active BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX ix_users_email ON users (email)")
    op.execute("""
        CREATE TABLE auth_sessions (
            token_hash VARCHAR(64) PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id)")
    op.execute("CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at)")
    op.execute("ALTER TABLE event_candidates ADD COLUMN event_id UUID UNIQUE REFERENCES events(id)")
    op.execute("ALTER TABLE event_candidates ADD COLUMN reviewed_by UUID REFERENCES users(id)")
    op.execute("ALTER TABLE event_candidates ADD COLUMN reviewed_at TIMESTAMPTZ")
    op.execute("ALTER TABLE event_candidates ADD COLUMN review_note VARCHAR(1000)")
    # Preserve old records, but never serve fictional seed data again.
    op.execute("UPDATE events SET is_published = FALSE WHERE is_demo = TRUE")


def downgrade() -> None:
    for column in ("review_note", "reviewed_at", "reviewed_by", "event_id"):
        op.execute(f"ALTER TABLE event_candidates DROP COLUMN {column}")
    op.execute("DROP TABLE auth_sessions")
    op.execute("DROP TABLE users")

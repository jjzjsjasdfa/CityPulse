"""Add event archival and audited user administration."""

from alembic import op

revision = "20260916_0008_admin"
down_revision = "20260913_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE events ADD COLUMN archived_at TIMESTAMPTZ")
    op.execute("ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ")
    op.execute("UPDATE users SET updated_at = created_at")
    op.execute("ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL")
    op.execute(
        """
        CREATE TABLE user_revisions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            actor_id UUID NOT NULL REFERENCES users(id),
            action VARCHAR(40) NOT NULL,
            note VARCHAR(1000) NOT NULL,
            before JSONB NOT NULL,
            after JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX ix_user_revisions_user_id ON user_revisions(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE user_revisions")
    op.execute("ALTER TABLE users DROP COLUMN updated_at")
    op.execute("ALTER TABLE events DROP COLUMN archived_at")

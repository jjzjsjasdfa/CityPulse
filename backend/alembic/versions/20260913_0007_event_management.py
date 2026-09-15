"""Audit event edits and correction decisions."""

from alembic import op

revision = "20260913_0007"
down_revision = "20260913_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE corrections ADD COLUMN reviewed_by UUID REFERENCES users(id)")
    op.execute("ALTER TABLE corrections ADD COLUMN resolution_note VARCHAR(1000)")
    op.execute("""
        CREATE TABLE event_revisions (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            actor_id UUID NOT NULL REFERENCES users(id),
            correction_id UUID REFERENCES corrections(id),
            note VARCHAR(1000) NOT NULL,
            before JSONB NOT NULL,
            after JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX ix_event_revisions_event_id ON event_revisions(event_id)")


def downgrade() -> None:
    op.execute("DROP TABLE event_revisions")
    op.execute("ALTER TABLE corrections DROP COLUMN resolution_note")
    op.execute("ALTER TABLE corrections DROP COLUMN reviewed_by")

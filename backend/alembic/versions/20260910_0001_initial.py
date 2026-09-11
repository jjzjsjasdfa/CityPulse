"""Initial event, evidence, history, and correction schema."""

from alembic import op

revision = "20260910_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute(
        """
        CREATE TABLE sources (
            id UUID PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            url VARCHAR(500) NOT NULL,
            level VARCHAR(32) NOT NULL,
            is_official BOOLEAN NOT NULL DEFAULT FALSE,
            reliability_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
            created_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE events (
            id UUID PRIMARY KEY,
            slug VARCHAR(180) NOT NULL UNIQUE,
            name VARCHAR(200) NOT NULL,
            category VARCHAR(32) NOT NULL,
            summary VARCHAR(360) NOT NULL,
            description TEXT NOT NULL,
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ NOT NULL,
            venue_name VARCHAR(200) NOT NULL,
            address VARCHAR(300) NOT NULL,
            city VARCHAR(80) NOT NULL,
            district VARCHAR(80) NOT NULL,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            location geography(POINT, 4326) NOT NULL,
            organizer VARCHAR(180) NOT NULL,
            status VARCHAR(32) NOT NULL,
            last_verified_at TIMESTAMPTZ NOT NULL,
            confidence DOUBLE PRECISION NOT NULL,
            attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
            official_url VARCHAR(500) NOT NULL,
            is_ad BOOLEAN NOT NULL DEFAULT FALSE,
            is_demo BOOLEAN NOT NULL DEFAULT FALSE,
            is_published BOOLEAN NOT NULL DEFAULT FALSE,
            published_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX events_location_gix ON events USING GIST (location)")
    op.execute("CREATE INDEX events_feed_idx ON events (city, starts_at, category)")
    op.execute(
        """
        CREATE TABLE event_source_links (
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            evidence_url VARCHAR(500) NOT NULL,
            checked_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (event_id, source_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE status_history (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
            status VARCHAR(32) NOT NULL,
            note VARCHAR(300) NOT NULL,
            changed_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE corrections (
            id UUID PRIMARY KEY,
            event_id UUID REFERENCES events(id) ON DELETE SET NULL,
            kind VARCHAR(40) NOT NULL,
            message TEXT NOT NULL,
            evidence_url VARCHAR(500),
            contact_email VARCHAR(320),
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS corrections")
    op.execute("DROP TABLE IF EXISTS status_history")
    op.execute("DROP TABLE IF EXISTS event_source_links")
    op.execute("DROP TABLE IF EXISTS events")
    op.execute("DROP TABLE IF EXISTS sources")


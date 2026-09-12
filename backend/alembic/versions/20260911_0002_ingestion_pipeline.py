"""Add the ingestion staging and review pipeline."""

from alembic import op

revision = "20260911_0002"
down_revision = "20260910_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE ingestion_runs (
            id UUID PRIMARY KEY,
            source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            status VARCHAR(32) NOT NULL,
            started_at TIMESTAMPTZ NOT NULL,
            finished_at TIMESTAMPTZ,
            discovered_count INTEGER NOT NULL DEFAULT 0,
            changed_count INTEGER NOT NULL DEFAULT 0,
            candidate_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT
        )
        """
    )
    op.execute("CREATE INDEX ingestion_runs_source_id_idx ON ingestion_runs (source_id)")
    op.execute(
        """
        CREATE TABLE raw_source_items (
            id UUID PRIMARY KEY,
            source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            external_id VARCHAR(64) NOT NULL,
            canonical_url VARCHAR(500) NOT NULL,
            title VARCHAR(300) NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            fetched_at TIMESTAMPTZ NOT NULL,
            first_seen_at TIMESTAMPTZ NOT NULL,
            last_seen_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT uq_raw_source_item_identity UNIQUE (source_id, external_id)
        )
        """
    )
    op.execute("CREATE INDEX raw_source_items_source_id_idx ON raw_source_items (source_id)")
    op.execute(
        """
        CREATE TABLE event_candidates (
            id UUID PRIMARY KEY,
            raw_item_id UUID NOT NULL REFERENCES raw_source_items(id) ON DELETE CASCADE,
            source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
            name VARCHAR(300) NOT NULL,
            category VARCHAR(32) NOT NULL,
            organizer VARCHAR(180) NOT NULL,
            venue_name VARCHAR(200),
            address VARCHAR(300),
            city VARCHAR(80),
            district VARCHAR(80),
            source_status VARCHAR(32),
            source_published_at TIMESTAMPTZ,
            starts_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ,
            official_url VARCHAR(500) NOT NULL,
            fingerprint VARCHAR(64) NOT NULL,
            facts JSONB NOT NULL DEFAULT '{}'::jsonb,
            review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT uq_event_candidate_raw_item UNIQUE (raw_item_id)
        )
        """
    )
    op.execute("CREATE INDEX event_candidates_source_id_idx ON event_candidates (source_id)")
    op.execute("CREATE INDEX event_candidates_city_idx ON event_candidates (city)")
    op.execute("CREATE INDEX event_candidates_fingerprint_idx ON event_candidates (fingerprint)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS event_candidates")
    op.execute("DROP TABLE IF EXISTS raw_source_items")
    op.execute("DROP TABLE IF EXISTS ingestion_runs")

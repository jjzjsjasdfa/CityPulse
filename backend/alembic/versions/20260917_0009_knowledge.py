"""Unified entries, review history and account favorites. Preserve artist IDs."""
from alembic import op
from sqlalchemy import text
from app.models import Entry, EntryName, EventEntry, KnowledgeRevision, Favorite
from app.poster_service import normalized

revision = "20260917_0009"
down_revision = "20260916_0008"
branch_labels = depends_on = None


def upgrade():
    bind = op.get_bind()
    for model in (Entry, EntryName, EventEntry, KnowledgeRevision, Favorite):
        model.__table__.create(bind)
    for row in bind.execute(text("SELECT id, name, profile FROM artists")).mappings():
        bind.execute(Entry.__table__.insert().values(id=row['id'], name=row['name'], kind='person', profile=row['profile'], version=1))
        for name in {normalized(n) for n in [row['name'], *row['profile'].get('aliases', [])] if normalized(n)}:
            bind.execute(EntryName.__table__.insert().values(entry_id=row['id'], name=name))
    bind.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    bind.execute(text("CREATE INDEX ix_entry_names_trgm ON entry_names USING gin (name gin_trgm_ops)"))
    bind.execute(text("CREATE INDEX ix_event_name_trgm ON events USING gin (name gin_trgm_ops)"))


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_event_name_trgm")
    for model in (Favorite, KnowledgeRevision, EventEntry, EntryName, Entry):
        model.__table__.drop(op.get_bind())

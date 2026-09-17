"""Poster contributions and reviewed artist knowledge."""
from alembic import op
from app.models import Artist, PosterSubmission, EventBackground

revision = "20260916_0008"
down_revision = "20260913_0007"
branch_labels = depends_on = None


def upgrade():
    for model in (Artist, PosterSubmission, EventBackground):
        model.__table__.create(op.get_bind())


def downgrade():
    for model in (EventBackground, PosterSubmission, Artist):
        model.__table__.drop(op.get_bind())

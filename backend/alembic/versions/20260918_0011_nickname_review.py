"""Moderate nickname changes before publishing them."""
from alembic import op
from app.models import NicknameChange

revision = '20260918_0011'
down_revision = '20260917_0010'
branch_labels = depends_on = None


def upgrade():
    NicknameChange.__table__.create(op.get_bind())


def downgrade():
    NicknameChange.__table__.drop(op.get_bind())

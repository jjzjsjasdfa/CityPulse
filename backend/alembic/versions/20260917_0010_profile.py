"""Account display profile; provider login remains disabled until integrated."""
from alembic import op
import sqlalchemy as sa

revision = '20260917_0010'
down_revision = '20260917_0009'
branch_labels = depends_on = None


def upgrade():
    op.add_column('users', sa.Column('nickname', sa.String(40), nullable=False, server_default=''))
    op.add_column('users', sa.Column('avatar', sa.String(20), nullable=False, server_default='person'))


def downgrade():
    op.drop_column('users', 'avatar')
    op.drop_column('users', 'nickname')

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.core.security import AdminDep, SessionDep
from app.models import NicknameChange, User
from app.schemas import NicknameChangeReview

router = APIRouter(prefix='/admin/nickname-changes', tags=['admin-profiles'])


def public(row, session):
    user = session.get(User, row.user_id)
    return {'id': row.id, 'user_id': row.user_id, 'email': user.email if user else '',
            'current_nickname': row.current_nickname, 'proposed_nickname': row.proposed_nickname,
            'status': row.status, 'review_note': row.review_note,
            'created_at': row.created_at, 'reviewed_at': row.reviewed_at}


@router.get('')
def queue(session: SessionDep, admin: AdminDep, status: str = 'pending'):
    if status not in {'pending', 'approved', 'rejected'}:
        raise HTTPException(422, '无效审核状态')
    rows = session.exec(select(NicknameChange).where(NicknameChange.status == status)
                        .order_by(NicknameChange.created_at, NicknameChange.id).limit(100)).all()
    return [public(row, session) for row in rows]


@router.post('/{change_id}/review')
def review(change_id: UUID, body: NicknameChangeReview, session: SessionDep, admin: AdminDep):
    row = session.exec(select(NicknameChange).where(
        NicknameChange.id == change_id).with_for_update()).first()
    if not row or row.status != 'pending':
        raise HTTPException(409, '昵称申请已处理，请刷新')
    user = session.get(User, row.user_id)
    if not user:
        raise HTTPException(404, '用户不存在')
    row.status = 'approved' if body.approve else 'rejected'
    row.review_note, row.reviewed_by, row.reviewed_at = body.note, admin.id, datetime.now(UTC)
    if body.approve:
        user.nickname = row.proposed_nickname
        session.add(user)
    session.add(row)
    session.commit()
    return public(row, session)

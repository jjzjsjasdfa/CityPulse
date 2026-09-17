from fastapi import APIRouter

from app.api.routes import auth, corrections, events, meta, posters, knowledge
from app.api.routes.admin import candidates as admin_candidates
from app.api.routes.admin import corrections as admin_corrections
from app.api.routes.admin import events as admin_events

api_router = APIRouter()
api_router.include_router(knowledge.router)
api_router.include_router(posters.router)
api_router.include_router(auth.router)
api_router.include_router(admin_candidates.router)
api_router.include_router(admin_events.router)
api_router.include_router(admin_corrections.router)
api_router.include_router(events.router)
api_router.include_router(corrections.router)
api_router.include_router(meta.router)

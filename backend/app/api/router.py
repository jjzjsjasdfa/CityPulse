from fastapi import APIRouter

from app.api.routes import corrections, events, meta

api_router = APIRouter()
api_router.include_router(events.router)
api_router.include_router(corrections.router)
api_router.include_router(meta.router)


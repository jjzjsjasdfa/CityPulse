from fastapi import APIRouter

from app.models import EventCategory
from app.schemas import CategoriesResponse, CategoryOption

router = APIRouter(prefix="/meta", tags=["meta"])

CATEGORY_LABELS = {
    EventCategory.performance: "演出",
    EventCategory.sports: "体育",
    EventCategory.exhibition: "展览",
    EventCategory.festival: "节庆",
    EventCategory.market: "市集",
    EventCategory.public_culture: "公共文化",
    EventCategory.pop_up: "限时体验",
    EventCategory.seasonal: "季节活动",
}


@router.get("/categories", response_model=CategoriesResponse)
def list_categories() -> CategoriesResponse:
    return CategoriesResponse(
        data=[CategoryOption(value=value, label=label) for value, label in CATEGORY_LABELS.items()]
    )


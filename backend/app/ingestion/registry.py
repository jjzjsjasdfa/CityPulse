from __future__ import annotations

from collections.abc import Callable

from app.core.config import settings
from app.ingestion.hunan_museum import HunanMuseumAdapter
from app.ingestion.showstart import ShowStartVenueAdapter
from app.ingestion.types import SourceAdapter

AdapterFactory = Callable[[], SourceAdapter]


def _hunan_museum() -> SourceAdapter:
    return HunanMuseumAdapter(
        base_url=settings.hunan_museum_base_url,
        user_agent=settings.ingestion_user_agent,
    )


def _showstart_changsha_concert_hall() -> SourceAdapter:
    return ShowStartVenueAdapter(
        user_agent=settings.ingestion_user_agent,
        amap_api_key=settings.amap_api_key.get_secret_value() if settings.amap_api_key else None,
    )


_ADAPTER_FACTORIES: dict[str, AdapterFactory] = {
    HunanMuseumAdapter.source.key: _hunan_museum,
    ShowStartVenueAdapter.source.key: _showstart_changsha_concert_hall,
}


def adapter_keys() -> list[str]:
    return sorted(_ADAPTER_FACTORIES)


def build_adapter(key: str) -> SourceAdapter:
    try:
        factory = _ADAPTER_FACTORIES[key]
    except KeyError as exc:
        choices = ", ".join(adapter_keys())
        raise ValueError(f"Unknown source adapter {key!r}. Available: {choices}") from exc
    return factory()

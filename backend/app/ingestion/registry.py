from __future__ import annotations

from collections.abc import Callable
from urllib.parse import urlsplit

from app.core.config import settings
from app.ingestion.http import SourceHttpClient
from app.ingestion.listing import HtmlListingAdapter
from app.ingestion.pipeline import EnrichmentPipeline, SourceJob
from app.ingestion.places import VenueLookup
from app.ingestion.showstart import SHOWSTART
from app.ingestion.showstart_detail import SHOWSTART_HOST, ShowStartDetailEnricher
from app.ingestion.types import ItemEnricher

JobFactory = Callable[[], SourceJob]


def _showstart_changsha_concert_hall() -> SourceJob:
    http = SourceHttpClient(
        user_agent=settings.ingestion_user_agent,
        fallback_user_agent="CityPulse/0.1",
    )
    api_key = settings.amap_api_key.get_secret_value() if settings.amap_api_key else None
    adapter = HtmlListingAdapter(SHOWSTART, http)
    pipeline = build_item_enrichment_pipeline(
        adapter.source.url,
        http,
        api_key,
    )
    return SourceJob(adapter=adapter, pipeline=pipeline, resources=(http,))


_JOB_FACTORIES: dict[str, JobFactory] = {
    SHOWSTART.source.key: _showstart_changsha_concert_hall,
}


def adapter_keys() -> list[str]:
    return sorted(_JOB_FACTORIES)


def build_job(key: str) -> SourceJob:
    try:
        factory = _JOB_FACTORIES[key]
    except KeyError as exc:
        choices = ", ".join(adapter_keys())
        raise ValueError(f"Unknown source adapter {key!r}. Available: {choices}") from exc
    return factory()


def build_item_enrichment_pipeline(
    canonical_url: str, http: SourceHttpClient, amap_api_key: str | None
) -> EnrichmentPipeline:
    """Build the same enrichment chain for an existing candidate as for ingestion."""
    enrichers: list[ItemEnricher] = []
    if urlsplit(canonical_url).hostname == SHOWSTART_HOST:
        enrichers.append(ShowStartDetailEnricher(http))
    enrichers.append(VenueLookup(amap_api_key, http.client))
    return EnrichmentPipeline(tuple(enrichers))

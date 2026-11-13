"""Composable discovery and enrichment orchestration."""

from dataclasses import dataclass, field
from typing import Self

from app.ingestion.types import (
    Closeable,
    DiscoveryAdapter,
    IngestionItem,
    ItemEnricher,
    SourceSpec,
)


@dataclass(frozen=True)
class EnrichmentPipeline:
    enrichers: tuple[ItemEnricher, ...] = ()

    def enrich(self, item: IngestionItem) -> IngestionItem:
        for enricher in self.enrichers:
            item = enricher.enrich(item)
        return item

    def enrich_all(self, items: list[IngestionItem]) -> list[IngestionItem]:
        return [self.enrich(item) for item in items]


@dataclass
class SourceJob:
    adapter: DiscoveryAdapter
    pipeline: EnrichmentPipeline = field(default_factory=EnrichmentPipeline)
    resources: tuple[Closeable, ...] = ()

    @property
    def source(self) -> SourceSpec:
        return self.adapter.source

    def fetch(self, *, limit: int = 20) -> list[IngestionItem]:
        items = self.adapter.discover(limit=limit)[:limit]
        if not items:
            raise RuntimeError(self.adapter.empty_result_message)
        return self.pipeline.enrich_all(items)

    def close(self) -> None:
        for resource in reversed(self.resources):
            resource.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

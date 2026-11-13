"""Declarative discovery for simple server-rendered HTML listing sources."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.ingestion.http import SourceHttpClient
from app.ingestion.types import IngestionItem, SourceSpec

ListingParser = Callable[[str, str], list[IngestionItem]]


@dataclass(frozen=True)
class HtmlListingSource:
    source: SourceSpec
    parser: ListingParser
    empty_result_message: str
    params: Mapping[str, Any] | None = None
    parser_base_url: str | None = None


class HtmlListingAdapter:
    def __init__(self, definition: HtmlListingSource, http: SourceHttpClient) -> None:
        self.definition = definition
        self.http = http

    @property
    def source(self) -> SourceSpec:
        return self.definition.source

    @property
    def empty_result_message(self) -> str:
        return self.definition.empty_result_message

    def discover(self, *, limit: int = 20) -> list[IngestionItem]:
        response = self.http.get(self.source.url, params=self.definition.params)
        parser_base_url = self.definition.parser_base_url or self.source.url
        return self.definition.parser(response.text, parser_base_url)[:limit]

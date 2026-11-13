from dataclasses import dataclass, replace

import httpx
import pytest

from app.ingestion.http import SourceHttpClient
from app.ingestion.listing import HtmlListingAdapter, HtmlListingSource
from app.ingestion.pipeline import EnrichmentPipeline, SourceJob
from app.ingestion.types import IngestionItem, SourceSpec
from app.models import SourceLevel

SOURCE = SourceSpec(
    key="test-source",
    name="Test source",
    url="https://events.example.test/list",
    level=SourceLevel.lead,
    is_official=False,
    reliability_score=0.5,
)


@dataclass
class FakeAdapter:
    items: list[IngestionItem]
    source = SOURCE
    empty_result_message = "No test items"

    def discover(self, *, limit: int = 20) -> list[IngestionItem]:
        return self.items[:limit]


@dataclass
class TitleEnricher:
    suffix: str

    def enrich(self, item: IngestionItem) -> IngestionItem:
        return replace(item, title=item.title + self.suffix)


@dataclass
class FakeResource:
    closed: bool = False

    def close(self) -> None:
        self.closed = True


def test_source_job_discovers_enriches_in_order_and_owns_resources() -> None:
    item = IngestionItem(title="Event", canonical_url="https://events.example.test/1")
    resource = FakeResource()
    job = SourceJob(
        adapter=FakeAdapter([item]),
        pipeline=EnrichmentPipeline((TitleEnricher(" detail"), TitleEnricher(" place"))),
        resources=(resource,),
    )

    with job:
        result = job.fetch(limit=1)
        assert result[0].title == "Event detail place"
        assert job.source is SOURCE
        assert resource.closed is False

    assert resource.closed is True


def test_source_job_rejects_an_empty_discovery_result() -> None:
    with pytest.raises(RuntimeError, match="No test items"):
        SourceJob(adapter=FakeAdapter([])).fetch()


def test_source_http_client_caches_robots_per_origin() -> None:
    requested_paths = []

    def respond(request: httpx.Request) -> httpx.Response:
        requested_paths.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /events/")
        return httpx.Response(200, text="ok")

    with SourceHttpClient(user_agent="CityPulse tests") as source_http:
        source_http.client.close()
        source_http.client = httpx.Client(transport=httpx.MockTransport(respond))
        source_http.get("https://events.example.test/events/1")
        source_http.get("https://events.example.test/events/2")

    assert requested_paths == ["/robots.txt", "/events/1", "/events/2"]


def test_html_listing_adapter_applies_declarative_source_options() -> None:
    requested_urls = []
    parser_calls = []

    def respond(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, text="listing html")

    def parse(html: str, base_url: str) -> list[IngestionItem]:
        parser_calls.append((html, base_url))
        return [
            IngestionItem(
                title=f"Event {index}",
                canonical_url=f"https://events.example.test/{index}",
            )
            for index in range(3)
        ]

    definition = HtmlListingSource(
        source=SOURCE,
        parser=parse,
        empty_result_message="No test items",
        params={"page": 2},
        parser_base_url="https://events.example.test/",
    )

    with SourceHttpClient(user_agent="CityPulse tests") as source_http:
        source_http.client.close()
        source_http.client = httpx.Client(transport=httpx.MockTransport(respond))
        items = HtmlListingAdapter(definition, source_http).discover(limit=2)

    assert [item.title for item in items] == ["Event 0", "Event 1"]
    assert parser_calls == [("listing html", "https://events.example.test/")]
    assert requested_urls == [
        "https://events.example.test/robots.txt",
        "https://events.example.test/list?page=2",
    ]

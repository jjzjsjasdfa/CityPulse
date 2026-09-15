from dataclasses import replace

import httpx

from app.ingestion.places import VenueLookup
from app.ingestion.types import IngestionItem


def poi(**changes):
    return {
        "id": "poi-1",
        "name": "长沙音乐厅",
        "cityname": "长沙市",
        "adname": "开福区",
        "address": "滨江文化园",
        "location": "112.9788,28.2423",
        **changes,
    }


def test_unique_same_city_name_match_is_cached_and_fills_coordinates():
    calls = []

    def respond(request):
        calls.append(request)
        assert request.url.params["citylimit"] == "true"
        return httpx.Response(200, json={"status": "1", "count": "1", "pois": [poi()]})

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        lookup = VenueLookup("private-test-key", client)
        item = IngestionItem(
            title="Concert",
            canonical_url="https://www.showstart.com/event/1",
            city="长沙",
            venue_name="长沙音乐厅",
        )
        for _ in range(2):
            result = lookup.enrich(item)
            assert result.address == "长沙市开福区滨江文化园"
            assert result.longitude is not None and result.longitude != 112.9788
            assert result.facts["enrichment"]["location_method"] == "amap"
        assert len(calls) == 1


def test_ambiguous_different_city_and_conflicting_addresses_need_review():
    item = IngestionItem(
        title="Concert",
        canonical_url="https://www.showstart.com/event/1",
        city="长沙",
        venue_name="长沙音乐厅",
    )
    for results in ([poi(), poi(id="poi-2")], [poi(cityname="北京市")]):
        with httpx.Client(
            transport=httpx.MockTransport(
                lambda _, results=results: httpx.Response(
                    200,
                    json={"status": "1", "count": str(len(results)), "pois": results},
                )
            )
        ) as client:
            result = VenueLookup("private-test-key", client).enrich(item)
            assert result.longitude is None
            assert result.facts["enrichment"]["warnings"]
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                json={"status": "1", "count": "1", "pois": [poi()]},
            )
        )
    ) as client:
        result = VenueLookup("private-test-key", client).enrich(replace(item, address="另一地址"))
        assert result.address == "另一地址" and result.latitude is None
        assert len(result.facts["enrichment"]["place_matches"]) == 1


def test_provider_failure_does_not_leak_key():
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(403))) as client:
        result = VenueLookup("private-test-key", client).enrich(
            IngestionItem(
                title="Concert",
                canonical_url="https://www.showstart.com/event/1",
                city="长沙",
                venue_name="长沙音乐厅",
            )
        )
        assert "private-test-key" not in str(result.payload())
        assert result.facts["enrichment"]["warnings"]

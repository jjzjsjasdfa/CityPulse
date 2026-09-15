"""Optional city-scoped venue lookup using the operator's own Amap Web Service key."""

from dataclasses import replace

import httpx

from app.ingestion.coordinates import to_wgs84
from app.ingestion.enrichment_types import EnrichmentInfo, PlaceMatch, SourceCoordinates
from app.ingestion.types import IngestionItem


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _identity(value: str) -> str:
    return "".join(value.split()).casefold()


class VenueLookup:
    def __init__(self, api_key: str | None, client: httpx.Client):
        self.api_key = api_key
        self.client = client
        self.cache: dict[tuple[str, str], tuple[list[PlaceMatch], int]] = {}

    def search(self, city: str, name: str) -> tuple[list[PlaceMatch], int]:
        key = (city, name)
        if key in self.cache:
            return self.cache[key]
        try:
            response = self.client.get(
                "https://restapi.amap.com/v3/place/text",
                params={
                    "key": self.api_key,
                    "keywords": name,
                    "city": city,
                    "citylimit": "true",
                    "offset": 20,
                    "page": 1,
                    "extensions": "base",
                    "output": "JSON",
                },
            )
            response.raise_for_status()
            data = response.json()
            if data.get("status") != "1":
                raise ValueError("Provider rejected the request")
            matches = []
            for poi in data.get("pois", []):
                try:
                    longitude, latitude = map(float, _text(poi.get("location")).split(","))
                    lon, lat = to_wgs84(longitude, latitude, "gcj02")
                    poi_city = _text(poi.get("cityname"))
                    if _identity(poi_city.removesuffix("市")) != _identity(city.removesuffix("市")):
                        continue
                    street = _text(poi.get("address"))
                    district = _text(poi.get("adname"))
                    if not street or not district or not _text(poi.get("id")):
                        continue
                    matches.append(
                        PlaceMatch(
                            id=poi["id"],
                            name=_text(poi.get("name")),
                            city=poi_city,
                            district=district,
                            address=poi_city + district + street,
                            longitude=lon,
                            latitude=lat,
                            source_coordinates=SourceCoordinates(
                                longitude=longitude, latitude=latitude, system="gcj02"
                            ),
                        )
                    )
                except (ValueError, TypeError):
                    continue
            self.cache[key] = (matches, int(data.get("count", 0)))
            return self.cache[key]
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            # Do not expose HTTP exception URLs: they contain the operator's API key.
            raise RuntimeError("地点查询失败，请检查地图服务配置或稍后重试。") from None

    def enrich(self, item: IngestionItem) -> IngestionItem:
        if item.latitude is not None and item.longitude is not None and item.address:
            return item
        info = EnrichmentInfo.model_validate(item.facts.get("enrichment", {}))
        if not self.api_key:
            info.warnings.append("来源位置不完整；配置地点查询服务后可按城市和场馆名补充。")
        elif not item.city or not item.venue_name:
            info.warnings.append("请先确认城市和场馆名称，再查询地点。")
        else:
            try:
                matches, total = self.search(item.city, item.venue_name)
                info.place_matches = matches
                exact = [
                    match
                    for match in matches
                    if _identity(match.name) == _identity(item.venue_name)
                    and (not item.district or match.district == item.district)
                ]
                if len(exact) == 1 and total <= 20:
                    match = exact[0]
                    # If the page already has an address, keep it and require a reviewer
                    # to resolve any discrepancy with a POI result before copying coordinates.
                    compatible = not item.address or _identity(match.address) == _identity(
                        item.address
                    )
                    if compatible:
                        info.location_method = "amap"
                        info.source_coordinates = match.source_coordinates
                        item = replace(
                            item,
                            address=item.address or match.address,
                            district=item.district or match.district,
                            longitude=match.longitude,
                            latitude=match.latitude,
                        )
                    else:
                        info.warnings.append("来源地址与地点查询结果不同，请选择核实后的地点。")
                elif matches:
                    info.warnings.append("地点名称存在多个或非精确匹配，请选择核实后的地点。")
                else:
                    info.warnings.append("没有找到同城场馆，请手动核实地址和坐标。")
            except RuntimeError as exc:
                info.warnings.append(str(exc))
        return replace(item, facts={**item.facts, "enrichment": info.model_dump()})

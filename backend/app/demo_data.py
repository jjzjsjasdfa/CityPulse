"""Deterministic fictional fixtures; coordinates are approximate test locations."""

import math
import random
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

DEMO_LOCATION = {"latitude": 28.19409, "longitude": 112.97667}
CATEGORIES = [
    "performance",
    "sports",
    "exhibition",
    "festival",
    "market",
    "public_culture",
    "pop_up",
    "seasonal",
]
TITLES = [
    "夜风小剧场",
    "城市慢跑会",
    "光影插画展",
    "街巷音乐节",
    "手作周末集",
    "城市读诗会",
    "陶艺体验日",
    "四季花园漫游",
]
BUCKETS = ["进行中", "3天内", "7天内", "15天内", "30天内", "30天后"]


def offset_point(latitude: float, longitude: float, east: float, north: float):
    return (
        latitude + north / 111.32,
        longitude + east / (111.32 * math.cos(math.radians(latitude))),
    )


def build_dataset(anchor: datetime | None = None) -> dict:
    anchor = anchor or datetime.now(UTC)
    rng = random.Random(20260913)
    locations = []
    # Four dense clusters plus a sparse ring in eight directions around the test user.
    for district, lat, lon, spread in [
        ("五一广场", 28.19409, 112.97667, 0.8),
        ("梅溪湖", 28.191, 112.887, 1.5),
        ("浏阳", 28.149, 113.643, 2.8),
        ("宁乡", 28.253, 112.551, 2.2),
    ]:
        for _ in range(20):
            point = offset_point(lat, lon, rng.gauss(0, spread), rng.gauss(0, spread))
            locations.append(("长沙", district, "长沙市", *point))
    for i in range(20):
        angle = (i % 8) * math.pi / 4
        radius = 5.5 + (i // 8) * 2.4
        point = offset_point(
            **DEMO_LOCATION, east=math.sin(angle) * radius, north=math.cos(angle) * radius
        )
        locations.append(("长沙", "近郊测试点", "长沙市", *point))
    for city, lat, lon in [
        ("株洲", 27.827, 113.134),
        ("湘潭", 27.830, 112.944),
        ("岳阳", 29.357, 113.129),
        ("益阳", 28.554, 112.356),
        ("娄底", 27.700, 111.994),
    ]:
        for i in range(10):
            spread = 0.5 if i < 7 else 7
            point = offset_point(lat, lon, rng.gauss(0, spread), rng.gauss(0, spread))
            locations.append((city, "测试街区", "长沙周边", *point))
    for city, lat, lon in [
        ("武汉", 30.593, 114.305),
        ("南昌", 28.683, 115.858),
        ("桂林", 25.274, 110.290),
        ("贵阳", 26.648, 106.630),
        ("广州", 23.129, 113.264),
        ("北京", 39.904, 116.407),
        ("上海", 31.230, 121.474),
        ("成都", 30.572, 104.067),
        ("哈尔滨", 45.803, 126.535),
        ("乌鲁木齐", 43.825, 87.617),
    ]:
        for i in range(5):
            spread = 0.7 if i < 3 else 5
            point = offset_point(lat, lon, rng.gauss(0, spread), rng.gauss(0, spread))
            locations.append((city, "测试街区", "湖南省外", *point))
    # Co-located events retain real shared coordinates; clients displace only labels.
    # Twelve entries share one venue and eight share another, including matching
    # time buckets and different dates. Total and regional distribution stay 200.
    for i in range(20):
        locations[i] = ("长沙", "五一广场同址测试" if i < 12 else "市中心共享空间", "长沙市",
                        28.1952 if i < 12 else 28.1928, 112.9780 if i < 12 else 112.9735)
    rows = []
    for i, (city, district, group, lat, lon) in enumerate(locations):
        bucket = i % 6
        days = [-0.25, 1.5, 5, 11, 23, 60][bucket] + (0 if i < 20 else (i % 5) * 0.04)
        start = anchor + timedelta(days=days)
        end = anchor + timedelta(hours=18) if bucket == 0 else start + timedelta(hours=8)
        category_index = (i + (i - 80) // 8) % 8 if 80 <= i < 100 else i % 8
        category = CATEGORIES[category_index]
        rows.append(
            {
                "id": str(uuid5(NAMESPACE_URL, f"citypulse-demo-2026/{i}")),
                "slug": f"fictional-{i + 1:03}",
                "name": f"{district} · {TITLES[category_index]} {i + 1:03}",
                "category": category,
                "summary": "虚构测试活动，用于验证地图分布、时间大小和方向提示。",
                "starts_at": start.isoformat(),
                "ends_at": end.isoformat(),
                "published_at": (anchor - timedelta(minutes=5 + i)).isoformat(),
                "location": {
                    "venue_name": f"虚构场地 {i + 1:03}",
                    "address": f"{city}{district}测试位置",
                    "city": city,
                    "district": district,
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                },
                "organizer": "虚构测试主办方",
                "price": "仅测试，无实际售票",
                "status": "announced",
                "last_verified_at": anchor.isoformat(),
                "confidence": 0,
                "attributes": ["虚构测试", group, BUCKETS[bucket]],
                "is_ad": False,
                "is_demo": True,
                "is_new": True,
                "is_ending_soon": bucket <= 2,
                "description": "此活动及场地均为虚构，不能用于出行或购票。经纬度为附近的测试位置。",
                "official_url": "",
                "sources": [],
                "status_history": [],
            }
        )
    return {
        "version": "citypulse-demo-200-v1",
        "anchor": anchor.isoformat(),
        "location": DEMO_LOCATION,
        "time_buckets": BUCKETS,
        "groups": {"长沙市": 100, "长沙周边": 50, "湖南省外": 50},
        "saved_ids": [rows[i]["id"] for i in [0, 40, 100, 120, 150, 175, 185, 195]],
        "events": rows,
    }

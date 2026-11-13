"""Manual-only 2027 map fixtures: python -m app.seed_map [--dry-run]."""

import argparse
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, select

from app.core.database import engine
from app.models import Event, EventCategory, EventStatus, StatusHistory

PREFIX = "map-seed-2027-"
CHINA = timezone(timedelta(hours=8))
# Approximate WGS84 map-test positions; these are not real event announcements.
VENUES = (
    ("五一广场", "芙蓉区", "五一大道与黄兴中路附近", 28.1947, 112.9705),
    ("黄兴路步行街", "天心区", "黄兴南路步行街附近", 28.1880, 112.9701),
    ("太平街", "天心区", "太平街附近", 28.1932, 112.9655),
    ("潮宗街", "开福区", "潮宗街附近", 28.2020, 112.9700),
    ("橘子洲", "岳麓区", "橘子洲景区附近", 28.1840, 112.9560),
    ("岳麓山", "岳麓区", "岳麓山东门附近", 28.1880, 112.9360),
    ("湖南大学", "岳麓区", "麓山南路附近", 28.1790, 112.9380),
    ("梅溪湖", "岳麓区", "梅溪湖路附近", 28.1910, 112.8880),
    ("洋湖湿地", "岳麓区", "洋湖大道附近", 28.1130, 112.9270),
    ("滨江文化园", "开福区", "新河三角洲附近", 28.2350, 112.9760),
    ("烈士公园", "开福区", "东风路附近", 28.2130, 112.9890),
    ("贺龙体育中心", "天心区", "芙蓉中路附近", 28.1750, 112.9760),
    ("红星商圈", "雨花区", "湘府东路附近", 28.1090, 113.0210),
    ("长沙南站片区", "雨花区", "花侯路附近", 28.1470, 113.0590),
    ("星沙松雅湖", "长沙县", "滨湖东路附近", 28.2680, 113.0920),
    ("望城月亮岛", "望城区", "月亮岛附近", 28.3150, 112.9160),
)
THEMES = (
    (EventCategory.performance, "江风爵士音乐会", "双人爵士与弦乐现场", "¥80–180", ["音乐", "夜间"]),
    (EventCategory.sports, "城市轻跑体验", "五公里慢跑与运动入门", "免费预约", ["户外", "运动"]),
    (EventCategory.exhibition, "城市记忆摄影展", "街巷摄影与城市生活记录", "¥30", ["摄影", "室内"]),
    (EventCategory.festival, "四季生活节", "音乐、手作和社区互动", "¥50–120", ["亲子", "节庆"]),
    (EventCategory.market, "周末手作市集", "陶艺、插画和独立设计摊位", "免费", ["市集", "手作"]),
    (EventCategory.public_culture, "湖湘阅读分享会", "地方故事分享与公共阅读", "免费预约", ["阅读", "公益"]),
    (EventCategory.pop_up, "独立设计快闪", "限时设计作品展示与交流", "¥20", ["设计", "快闪"]),
    (EventCategory.seasonal, "自然观察漫步", "植物观察与四季主题漫步", "¥15", ["自然", "户外"]),
)


def fixtures() -> list[Event]:
    """Build 64 events across all categories and four seasons, without database I/O."""
    records = []
    stamp = datetime(2027, 1, 1, 8, tzinfo=CHINA)
    statuses = (EventStatus.announced, EventStatus.on_sale, EventStatus.sold_out,
                EventStatus.postponed)
    for venue_index, (venue, district, address, lat, lon) in enumerate(VENUES):
        for season in range(4):
            category, title, summary, price, traits = THEMES[(venue_index + season) % 8]
            slug = f"{PREFIX}{venue_index + 1:02d}-{season + 1}"
            start = datetime(2027, 2 + season * 3, 6 + venue_index, 10 + season * 2,
                             tzinfo=CHINA)
            duration = timedelta(days=14) if category == EventCategory.exhibition else (
                timedelta(days=2) if category in (EventCategory.market, EventCategory.festival)
                else timedelta(hours=3)
            )
            # Two overlapping locations plus two nearby offsets exercise dense map markers.
            latitude = lat + (0.0009 if season == 2 else -0.0008 if season == 3 else 0)
            longitude = lon + (0.0008 if season == 2 else -0.0007 if season == 3 else 0)
            records.append(Event(
                id=uuid5(NAMESPACE_URL, slug), slug=slug,
                name=f"【测试】{venue}·{title}", category=category,
                summary=f"2027 地图测试数据：{summary}。虚构活动，请勿据此前往。",
                description=(f"这是手动导入的虚构 seed 活动，用于测试地图标记、类别筛选、"
                             f"重叠点位及详情展示。地点为{venue}附近的近似坐标。"
                             f"内容：{summary}；票价、主办方和日期均为测试设定。"),
                starts_at=start, ends_at=start + duration, venue_name=f"{venue}（测试点位）",
                address=f"长沙市{district}{address}（近似测试位置）", city="长沙",
                district=district, latitude=latitude, longitude=longitude,
                location=f"SRID=4326;POINT({longitude} {latitude})",
                organizer="CityPulse 虚构测试活动组", price=price,
                status=statuses[(venue_index + season) % len(statuses)],
                last_verified_at=stamp, confidence=0.5, traits=["测试数据", *traits],
                official_url=f"https://example.invalid/{slug}", is_ad=False,
                is_published=True, published_at=stamp, created_at=stamp, updated_at=stamp,
            ))
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB access")
    args = parser.parse_args()
    events = fixtures()
    summary = {"year": 2027, "total": len(events),
               "categories": dict(Counter(event.category for event in events))}
    if args.dry_run:
        print(json.dumps({**summary, "dry_run": True}, ensure_ascii=False, indent=2))
        return
    created = 0
    with Session(engine) as session:
        for event in events:
            if session.exec(select(Event.id).where(Event.slug == event.slug)).first():
                continue
            session.add(event)
            session.flush()
            session.add(StatusHistory(
                event_id=event.id, status=event.status, changed_at=event.created_at,
                note="手动创建 2027 年虚构地图测试活动；不是实际活动公告。",
            ))
            created += 1
        session.commit()
    print(json.dumps({**summary, "created": created, "skipped": len(events) - created},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

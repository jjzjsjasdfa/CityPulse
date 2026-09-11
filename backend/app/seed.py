from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from geoalchemy2.elements import WKTElement
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.database import engine
from app.models import (
    Event,
    EventCategory,
    EventSourceLink,
    EventStatus,
    Source,
    SourceLevel,
    StatusHistory,
)

SHANGHAI = ZoneInfo("Asia/Shanghai")


def _event(*, now: datetime, offset: int, duration: int, **values: object) -> Event:
    longitude = float(values.pop("longitude"))
    latitude = float(values.pop("latitude"))
    return Event(
        starts_at=now + timedelta(days=offset),
        ends_at=now + timedelta(days=offset + duration),
        last_verified_at=now - timedelta(hours=8),
        published_at=now - timedelta(days=min(offset, 6)),
        created_at=now,
        updated_at=now,
        latitude=latitude,
        longitude=longitude,
        location=WKTElement(f"POINT({longitude} {latitude})", srid=4326),
        is_demo=True,
        is_published=True,
        is_ad=False,
        **values,
    )


def seed() -> None:
    now = datetime.now(SHANGHAI).replace(minute=0, second=0, microsecond=0)
    with Session(engine) as session:
        if session.exec(select(func.count()).select_from(Event)).one() > 0:
            print("Seed skipped: events already exist.")
            return

        city_source = Source(
            name="城迹示例资料库",
            url="https://example.com/citypulse",
            level=SourceLevel.authority,
            is_official=True,
            reliability_score=0.96,
            created_at=now,
        )
        venue_source = Source(
            name="场馆示例发布页",
            url="https://example.com/venue",
            level=SourceLevel.trusted,
            is_official=True,
            reliability_score=0.88,
            created_at=now,
        )
        session.add(city_source)
        session.add(venue_source)

        events = [
            _event(
                now=now,
                offset=2,
                duration=2,
                slug="xiangjiang-riverside-market-demo",
                name="湘江周末河畔市集",
                category=EventCategory.market,
                summary="独立手作、城市咖啡与落日音乐，在河西步行空间限时集合。",
                description="这是用于产品联调的演示活动，不代表真实举办信息。现场按生活方式、手作与轻餐饮分区，适合作为周末散步目的地。",
                venue_name="湘江新区滨水空间（示例）",
                address="长沙市岳麓区滨江景观道（示例）",
                city="长沙",
                district="岳麓区",
                latitude=28.2076,
                longitude=112.9561,
                organizer="城迹示例主办方",
                status=EventStatus.announced,
                confidence=0.94,
                traits=["免费", "户外", "亲子友好"],
                official_url="https://example.com/events/river-market",
            ),
            _event(
                now=now,
                offset=5,
                duration=1,
                slug="meixihu-night-concert-demo",
                name="梅溪湖秋夜音乐会",
                category=EventCategory.performance,
                summary="一场以城市夜色为主题的室内跨界音乐演出。",
                description="这是演示数据。详情页重点验证场次、场馆、官方入口、来源证据和状态时间轴的阅读体验。",
                venue_name="梅溪湖艺术中心（示例）",
                address="长沙市岳麓区梅溪湖路（示例）",
                city="长沙",
                district="岳麓区",
                latitude=28.1972,
                longitude=112.9067,
                organizer="湖畔演艺工作室（示例）",
                status=EventStatus.on_sale,
                confidence=0.91,
                traits=["需预约", "室内", "无障碍"],
                official_url="https://example.com/events/night-concert",
            ),
            _event(
                now=now,
                offset=8,
                duration=20,
                slug="kaifu-design-exhibition-demo",
                name="正在发生：城市设计小展",
                category=EventCategory.exhibition,
                summary="从招牌、街角与公共座椅重新观察城市日常。",
                description="这是演示数据。展览以平台自制文字卡呈现，不复制任何第三方海报或受保护的视觉表达。",
                venue_name="潮宗街公共展厅（示例）",
                address="长沙市开福区潮宗街（示例）",
                city="长沙",
                district="开福区",
                latitude=28.2042,
                longitude=112.9753,
                organizer="城市观察小组（示例）",
                status=EventStatus.announced,
                confidence=0.86,
                traits=["免费", "室内", "适合独自前往"],
                official_url="https://example.com/events/design-exhibition",
            ),
            _event(
                now=now,
                offset=12,
                duration=1,
                slug="helong-stadium-run-demo",
                name="城市十公里夜跑",
                category=EventCategory.sports,
                summary="从贺龙体育中心出发的城市夜跑体验活动。",
                description="这是演示数据。报名、装备领取和线路调整均应以官方页面为准。",
                venue_name="贺龙体育中心东广场（示例）",
                address="长沙市天心区劳动西路（示例）",
                city="长沙",
                district="天心区",
                latitude=28.1784,
                longitude=112.9782,
                organizer="长沙城市跑团（示例）",
                status=EventStatus.on_sale,
                confidence=0.9,
                traits=["需报名", "户外", "运动"],
                official_url="https://example.com/events/night-run",
            ),
            _event(
                now=now,
                offset=18,
                duration=3,
                slug="orange-island-light-festival-demo",
                name="橘洲秋日光影节",
                category=EventCategory.festival,
                summary="沿江公共空间的轻量光影装置与夜间漫游路线。",
                description="这是演示数据。活动不会默认请求持续定位，用户可主动移动地图查找当前视口事件。",
                venue_name="橘子洲北段（示例）",
                address="长沙市岳麓区橘子洲（示例）",
                city="长沙",
                district="岳麓区",
                latitude=28.1964,
                longitude=112.9684,
                organizer="城市节庆办公室（示例）",
                status=EventStatus.announced,
                confidence=0.83,
                traits=["免费", "户外", "夜间"],
                official_url="https://example.com/events/light-festival",
            ),
        ]
        session.add_all(events)
        session.flush()

        for index, event in enumerate(events):
            source = city_source if index % 2 == 0 else venue_source
            session.add(
                EventSourceLink(
                    event_id=event.id,
                    source_id=source.id,
                    evidence_url=event.official_url,
                    checked_at=event.last_verified_at,
                )
            )
            session.add(
                StatusHistory(
                    event_id=event.id,
                    source_id=source.id,
                    status=event.status,
                    note="演示来源完成首次核验",
                    changed_at=event.last_verified_at,
                )
            )

        session.commit()
        print(f"Seeded {len(events)} demo events for 长沙.")


if __name__ == "__main__":
    seed()


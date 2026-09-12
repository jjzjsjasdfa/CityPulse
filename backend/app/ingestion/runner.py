from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.database import engine
from app.ingestion.registry import adapter_keys, build_adapter
from app.ingestion.types import IngestionItem, SourceSpec
from app.models import (
    CandidateReviewStatus,
    EventCandidate,
    IngestionRun,
    IngestionRunStatus,
    RawSourceItem,
    Source,
)


def utc_now() -> datetime:
    return datetime.now(UTC)


def content_hash(item: IngestionItem) -> str:
    encoded = json.dumps(item.payload(), ensure_ascii=False, sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def _get_or_create_source(session: Session, spec: SourceSpec) -> Source:
    source = session.exec(select(Source).where(Source.url == spec.url)).first()
    if source is not None:
        return source
    source = Source(
        name=spec.name,
        url=spec.url,
        level=spec.level,
        is_official=spec.is_official,
        reliability_score=spec.reliability_score,
        created_at=utc_now(),
    )
    session.add(source)
    session.flush()
    return source


def _upsert_item(session: Session, source: Source, item: IngestionItem) -> tuple[bool, bool]:
    now = utc_now()
    digest = content_hash(item)
    raw = session.exec(
        select(RawSourceItem).where(
            RawSourceItem.source_id == source.id,
            RawSourceItem.external_id == item.external_id,
        )
    ).first()
    created = raw is None
    changed = created or (raw is not None and raw.content_hash != digest)

    if raw is None:
        raw = RawSourceItem(
            source_id=source.id,
            external_id=item.external_id,
            canonical_url=item.canonical_url,
            title=item.title,
            content_hash=digest,
            payload=item.payload(),
            fetched_at=now,
            first_seen_at=now,
            last_seen_at=now,
        )
        session.add(raw)
        session.flush()
    else:
        raw.last_seen_at = now
        raw.fetched_at = now
        if changed:
            raw.canonical_url = item.canonical_url
            raw.title = item.title
            raw.content_hash = digest
            raw.payload = item.payload()
        session.add(raw)

    candidate = session.exec(
        select(EventCandidate).where(EventCandidate.raw_item_id == raw.id)
    ).first()
    candidate_created = candidate is None
    if candidate is None:
        candidate = EventCandidate(
            raw_item_id=raw.id,
            source_id=source.id,
            name=item.title,
            category=item.category,
            organizer=item.organizer,
            price=item.price,
            venue_name=item.venue_name,
            address=item.address,
            city=item.city,
            district=item.district,
            source_status=item.source_status,
            source_published_at=item.source_published_at,
            starts_at=item.starts_at,
            ends_at=item.ends_at,
            official_url=item.canonical_url,
            fingerprint=item.fingerprint,
            facts=item.payload(),
            review_status=CandidateReviewStatus.pending,
            created_at=now,
            updated_at=now,
        )
        session.add(candidate)
    elif changed:
        candidate.name = item.title
        candidate.category = item.category
        candidate.organizer = item.organizer
        candidate.price = item.price
        candidate.venue_name = item.venue_name
        candidate.address = item.address
        candidate.city = item.city
        candidate.district = item.district
        candidate.source_status = item.source_status
        candidate.source_published_at = item.source_published_at
        candidate.starts_at = item.starts_at
        candidate.ends_at = item.ends_at
        candidate.official_url = item.canonical_url
        candidate.fingerprint = item.fingerprint
        candidate.facts = item.payload()
        candidate.review_status = CandidateReviewStatus.pending
        candidate.updated_at = now
        session.add(candidate)
    return changed, candidate_created


def persist(items: list[IngestionItem], spec: SourceSpec) -> dict[str, int | str]:
    with Session(engine) as session:
        source = _get_or_create_source(session, spec)
        run = IngestionRun(
            source_id=source.id,
            status=IngestionRunStatus.running,
            started_at=utc_now(),
            discovered_count=len(items),
        )
        session.add(run)
        source_id = source.id
        run_id = run.id
        session.commit()

    try:
        with Session(engine) as session:
            source = session.get(Source, source_id)
            run = session.get(IngestionRun, run_id)
            if source is None or run is None:
                raise RuntimeError("The source or ingestion run disappeared before persistence.")
            changed_count = 0
            candidate_count = 0
            for item in items:
                changed, created = _upsert_item(session, source, item)
                changed_count += int(changed)
                candidate_count += int(created)
            run.status = IngestionRunStatus.succeeded
            run.finished_at = utc_now()
            run.changed_count = changed_count
            run.candidate_count = candidate_count
            session.add(run)
            session.commit()
    except Exception as exc:
        with Session(engine) as session:
            failed_run = session.get(IngestionRun, run_id)
            if failed_run is not None:
                failed_run.status = IngestionRunStatus.failed
                failed_run.finished_at = utc_now()
                failed_run.error_message = str(exc)[:4000]
                session.add(failed_run)
                session.commit()
        raise RuntimeError(f"Ingestion persistence failed: {exc}") from exc
    return {
        "run_id": str(run_id),
        "discovered": len(items),
        "changed": changed_count,
        "new_candidates": candidate_count,
    }


def run(*, source_key: str, limit: int, dry_run: bool) -> dict[str, object]:
    adapter = build_adapter(source_key)
    with adapter:
        items = adapter.fetch(limit=limit)
    if dry_run:
        return {
            "dry_run": True,
            "source": source_key,
            "discovered": len(items),
            "items": [
                {
                    "external_id": item.external_id,
                    "fingerprint": item.fingerprint,
                    **item.payload(),
                }
                for item in items
            ],
        }
    return {"source": source_key, **persist(items, adapter.source)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch event facts into review staging.")
    parser.add_argument("source", choices=adapter_keys())
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be between 1 and 100")
    try:
        result = run(source_key=args.source, limit=args.limit, dry_run=args.dry_run)
    except Exception as exc:
        parser.exit(1, f"Ingestion stopped safely: {exc}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()

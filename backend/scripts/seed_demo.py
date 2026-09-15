"""Optional PostGIS migration for the same 200 fixtures. Dry run unless --write."""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from geoalchemy2 import WKTElement
from sqlmodel import Session

from app.demo_data import build_dataset
from app.models import Event


def database_events(data):
    rows = []
    for source in data["events"]:
        fields = {key: value for key, value in source.items() if key in Event.model_fields}
        fields.update(source["location"])
        fields.update(
            traits=source["attributes"],
            is_published=True,
            is_demo=True,
            location=WKTElement(f"POINT({fields['longitude']} {fields['latitude']})", srid=4326),
        )
        rows.append(Event.model_validate(fields))
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file", type=Path, help="Optional exported JSON; default regenerates dates"
    )
    parser.add_argument(
        "--write", action="store_true", help="Write only these fixture IDs to PostGIS"
    )
    args = parser.parse_args()
    data = json.loads(args.file.read_text(encoding="utf-8")) if args.file else build_dataset()
    rows = database_events(data)
    if not args.write:
        print(f"Validated {len(rows)} fictional events; database unchanged. Add --write to import.")
    else:
        from app.core.database import engine

        with Session(engine) as session:
            for row in rows:
                existing = session.get(Event, row.id)
                if existing is not None and not existing.is_demo:
                    raise ValueError(f"Refusing to replace a real event: {row.id}")
                if existing is None:
                    session.add(row)
                else:
                    for key in Event.model_fields:
                        if key not in {"id", "created_at", "updated_at"}:
                            setattr(existing, key, getattr(row, key))
                    existing.updated_at = datetime.now(UTC)
            session.commit()
        print(f"Imported {len(rows)} fictional events. Other records were not changed.")

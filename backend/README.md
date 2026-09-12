# CityPulse API

FastAPI + SQLModel + PostgreSQL/PostGIS API for verified city happenings.

## Local development

From the repository root, `docker compose up --build` starts PostgreSQL/PostGIS,
runs Alembic, inserts idempotent demo data, and serves the API on port 8000.

- Swagger UI: http://localhost:8000/docs
- OpenAPI JSON: http://localhost:8000/openapi.json
- Health check: http://localhost:8000/health

The seed records are clearly marked `is_demo: true` and use `example.com` links.
They exist to unblock the client and must be replaced with verified source records
before a public test.

## Event ingestion

Each website has its own adapter. The common runner handles fetching, hashing,
idempotent database upserts, and run auditing without containing website URLs or HTML
rules. All adapters check `robots.txt`, download no images, copy no promotional
description, and write to review staging rather than public `events`.

Set `INGESTION_USER_AGENT` in the root `.env` to a real project contact email or URL. For
example: `CityPulse/0.1 (mailto:you@example.com)`. Then restart the API and run:

```powershell
# Preview only; does not write to PostgreSQL
docker compose exec api python -m app.ingestion hunan-museum --dry-run --limit 10

# Reachable test source: current Changsha Concert Hall listings on ShowStart
docker compose exec api python -m app.ingestion showstart-changsha-concert-hall --dry-run --limit 10

# Store idempotent source snapshots and pending review candidates
docker compose exec api python -m app.ingestion showstart-changsha-concert-hall --limit 20
```

If the museum site or its `robots.txt` cannot be reached, the command stops without
changing candidate data. A candidate still has nullable event start/end fields because
the page's publishing timestamp must not be mistaken for the actual activity time.
Venue and address also remain empty until a reviewer verifies where that specific
activity takes place.

ShowStart is a third-party ticket platform, so its source is stored as a non-official
`lead` even when its listing contains a concrete date and venue. A reviewer must verify
the event against an organizer or venue source before publishing it.

See [`app/ingestion/README.md`](app/ingestion/README.md) for the adapter architecture
and instructions for adding another website.

For a local Python workflow, use Python 3.12+ and run:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\uvicorn app.main:app --reload
```

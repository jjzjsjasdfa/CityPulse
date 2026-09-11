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

For a local Python workflow, use Python 3.12+ and run:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python -m app.seed
.\.venv\Scripts\uvicorn app.main:app --reload
```


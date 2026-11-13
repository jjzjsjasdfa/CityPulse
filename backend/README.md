# CityPulse API

FastAPI + SQLModel + PostgreSQL/PostGIS. See the root README for the complete workflow.

## Local Python development

Use Python 3.12+ and an existing PostgreSQL database with PostGIS. Inside `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
# Set DATABASE_URL for your local database if the development default differs.
python -m alembic upgrade head
python -m app.manage_users YOUR_EMAIL
# Optionally add your real project contact to INGESTION_USER_AGENT.
python -m app.ingestion --dry-run --limit 20
python -m app.ingestion --limit 100
python -m uvicorn app.main:app --reload
```

Docker startup runs migrations and `app.bootstrap`, then serves the API. Bootstrap
attempts the default Showstart import and logs failures. `INGESTION_ON_STARTUP=false`
disables that attempt; manual ingestion remains available. No accounts or test events
are seeded automatically. The administrator CLI never changes an existing account.

## Manual 2027 map seed

`app.seed_map` inserts 64 explicitly fictional, published events around 16 Changsha
locations, covering all eight categories, four seasons, overlapping/nearby markers,
and announced/on-sale/sold-out/postponed states. All event and metadata dates are in
2027. Coordinates are approximate WGS84 test positions, not real event locations.
The script skips existing seed slugs and commits new events with status history in
one transaction. It does not modify real events or call ingestion.

From the repository root, with the API container running:

```sh
# Copy the script into an existing container without rebuilding/restarting it.
docker compose cp backend/app/seed_map.py api:/app/app/seed_map.py
docker compose exec api python -m app.seed_map --dry-run
docker compose exec api python -m app.seed_map
```

For local Python, run `python -m app.seed_map` from `backend` using the intended
`DATABASE_URL`. This is manual-only: neither build nor startup invokes the seed.
Open the map around Changsha without a restrictive date filter to see the events.
Publication timestamps are also in 2027, so these fixtures do not simulate current
nearby-new-event alerts before 2027. The `--dry-run` option does not access the DB.

## Endpoints

Public routers live in `app/api/routes`; admin routers live in
`app/api/routes/admin/{events,candidates,corrections,users}.py`. Shared event mutations
live in `app/services/events.py`, with the calling route owning the transaction.
See [the architecture guide](../docs/BACKEND_STRUCTURE.md) for the responsibility map.

| Method | Path under `/api/v1` | Access |
| --- | --- | --- |
| POST | `/auth/register` | Create a regular account |
| POST | `/auth/login` | Email/password; returns bearer token, expiry and user |
| GET | `/auth/me` | Current active session |
| POST | `/auth/logout` | Revoke current session |
| GET | `/admin/candidates?status=pending&offset=0&limit=20` | Admin; lightweight review queue summaries |
| GET | `/admin/candidates/{id}` | Admin; current complete candidate detail |
| POST | `/admin/candidates/{id}/approve` | Admin; complete verified event facts |
| POST | `/admin/candidates/{id}/reject` | Admin; required rejection reason |
| POST | `/admin/candidates/{id}/enrich` | Admin; refresh a pending candidate's details/location |
| GET | `/events`, `/events/map`, `/events/{id}` | Public approved events |
| GET | `/admin/candidates/{id}/comparison` | Admin; source vs last public fields |
| GET | `/admin/events`, `/admin/events/{id}` | Admin; summary list and current complete event detail |
| POST | `/admin/events` | Admin; manually create a reviewed event |
| PUT | `/admin/events/{id}` | Admin; complete replacement of editable fields, timestamp and note |
| POST | `/admin/events/{id}/archive`, `/restore` | Admin; reversible removal without erasing audit data |
| GET | `/admin/events/{id}/revisions` | Admin; paginated before/after audit |
| GET, POST | `/admin/users` | Admin; paginated summary search and account creation |
| GET, PUT | `/admin/users/{id}` | Admin; inspect or change role/status |
| POST | `/admin/users/{id}/revoke-sessions` | Admin; revoke every active login |
| GET | `/admin/users/{id}/revisions` | Admin; account administration audit |
| POST | `/corrections` | Submit a report about a public event |
| GET | `/admin/corrections?status=pending` | Admin; paginated correction summaries without private contact details |
| GET | `/admin/corrections/{id}` | Admin; current complete correction detail |
| POST | `/admin/corrections/{id}/review` | Admin; reviewing, accepted or rejected |

`GET /events` accepts `q`, `when=any|today|weekend`, `time_scope=upcoming|past`,
`page` and `page_size` alongside the existing category/date filters. Search treats
wildcards as literal text. Date filters use Asia/Shanghai and pagination has a stable
ID tie-breaker. The map remains an ongoing/upcoming event view.

Event updates require `expected_updated_at`, `review_note`, and `is_published`,
plus all editable event fields. Correction review requires its own
`expected_updated_at`, `status` and `resolution_note`; an optional `event_update`
is accepted only with status `accepted`, and has the same event update contract.
Both records and the edit audit commit atomically. Internal notes and report contact
details are not copied into the public status timeline.

Archived events are excluded from every public event endpoint. Restoring an event
keeps it unpublished until an administrator explicitly reviews and republishes it.
User administration prevents self-demotion/self-disable and preserves at least one
active administrator. Disabling an account also revokes its active sessions.

Both decisions require `expected_updated_at` from the candidate response, plus a
review note. Approval requires timezone-aware start/end timestamps, a valid time
range, real venue/address/organizer and WGS84 coordinates. The public event, source
link, history record and candidate audit are committed together under a row lock.
Changed source data returns a candidate to pending and withdraws its linked event.

Passwords use scrypt (N=131072, r=8, p=1) with random salts. Sessions use 32 random
bytes, SHA-256 token hashes and 12-hour expiration. User roles are read from the
database for every request. Registration rejects extra fields such as `role`.
Validation errors omit raw inputs so passwords cannot appear in error responses.

## Ingestion

`python -m app.ingestion` defaults to `showstart-changsha-concert-hall`. Each adapter
checks robots.txt and fetches only factual text into raw snapshots and candidates.
Showstart remains a non-official third-party source. Reviewers must check the
organizer/venue source and enter its URL in the review form. The original Showstart
URL remains linked as source evidence; the verified URL is shown separately.

See [adapter documentation](app/ingestion/README.md).

### Detail and venue enrichment

Showstart ingestion now follows each listing's event link and reads factual SSR
detail data: venue name, city, district, address, event time range and coordinates.
It does not evaluate remote JavaScript or store account state, images, or promotional
HTML. Years missing from `showTime` come from the corresponding listing's start date;
ticket sale/closing dates are never interpreted as performance dates. Conflicting
dates or missing years produce a review warning instead of a guess.

Showstart uses `CityPulse/0.1` as its default User-Agent. Old placeholder contacts
are replaced with that truthful product identifier; a contact value is optional.
robots.txt checks still apply to every page.

Showstart's map uses BD-09; candidate coordinates are approximately normalized to
WGS84. Original coordinates, coordinate system, detail URL and visible time text
remain available in `enrichment` for review. Migration `20260913_0006` adds the
candidate latitude/longitude columns.

For sources without a complete location, optionally set `AMAP_API_KEY` to your own
Amap **Web Service** key in the root `.env` (or backend environment for local Python).
Only the server uses this key. Venue lookup restricts results to the candidate city;
one exact same-name match can fill a missing address and normalized coordinates.
Ambiguous matches, district mismatches, or conflicts with a source address are shown
as choices rather than silently copied. Queries for the same city/name are cached
within one import. No Amap key is needed when Showstart supplies the location itself.

In the admin form, **补充详情和地点** refreshes an existing pending candidate and
persists the result. The browser merges unchanged fields and preserves manual edits.
**使用此地点** copies a lookup choice into the form for the administrator to verify
and publish. Supplementation does not approve a candidate or publish an event.
Failed detail requests retain previously collected fields, and diagnostic changes
alone do not withdraw approved events.

After upgrading, rebuild the API container and refresh the frontend:

```powershell
docker compose up --build -d api
```

## Tests

`python -m pytest` runs unit/auth/contract tests. Set `CITYPULSE_TEST_POSTGRES=1` to
also run publication tests against `DATABASE_URL`. Those tests create a randomly
named schema inside a transaction and roll it back, leaving application data intact.
`python -m ruff check app tests` checks style.

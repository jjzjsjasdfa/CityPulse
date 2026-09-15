# CityPulse

CityPulse is a Changsha event discovery app with a FastAPI/PostGIS backend and an
Expo React Native frontend. Showstart listings enter an administrator review queue.
Only approved, published, non-demo events appear in the public feed and map.

## Start

Use Docker Desktop, Node.js 22.13+ and npm.

1. Copy `.env.example` to `.env`. `INGESTION_USER_AGENT` defaults to `CityPulse/0.1`;
   optionally append your real contact email or project URL in parentheses.
2. Run `docker compose up --build`. Startup migrates the database and imports
   Showstart candidates. Source/network failures are logged and do not stop the API.
3. Create your administrator, using your own email:
   `docker compose exec api python -m app.manage_users YOUR_EMAIL`.
   The command prompts privately for a password; there are no default accounts.
4. In `mobile`, run `npm install` and `npm start` (or `npm run web`).
5. Sign in as the administrator and open **审核**. Inspect each source and supply
   verified missing details, including end time, address, WGS84 coordinates and
   organizer. Add a review note, then choose **通过并公开** or **拒绝**.
6. Regular users register from the login screen. Accepted upcoming events appear
   in their feed; they never receive the review page. Approved events whose end
   time has passed appear under **往期活动** on the discovery page. The default
   feed and map show only ongoing or upcoming events.

The API is at `http://localhost:8000`, documentation at `/docs`, and health at
`/health`. For physical devices, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your
computer's LAN address followed by `:8000/api/v1`.

## Authentication and review

- Email/password authentication uses scrypt password hashing and random, revocable
  bearer sessions. Only token hashes are stored in the database. Sessions expire
  after 12 hours; logout revokes the current session immediately.
- Session tokens stay in app memory. Restarting/reloading the app requires login.
  Bookmarks persist on the device separately for each account.
- Registration always creates `regular` users. Administrators are provisioned with
  the CLI. Every review API request checks the current database role and activity.
- Approved candidates link to one public event, source evidence and status history.
  Concurrent or stale decisions return 409. Re-importing unchanged data preserves
  decisions. Changed data withdraws the previous event and returns to review;
  approval updates that same event, while rejection leaves it unpublished.
- Public event endpoints remain readable without login, including shared links.
  The app's account and review navigation requires login.

## Discovery and administration

- Discovery searches activity names, venues and summaries. **今天** and **本周末**
  use Beijing time; weekend means Saturday/Sunday of the current week. **加载更多**
  fetches the next 50 matching events. Changing search or filters resets pagination.
- In **审核 → 候选审核**, **保存草稿 / 恢复草稿** persist a draft on the current
  device for the current administrator. Drafts are saved explicitly, not automatically.
  An outdated draft is shown for reference rather than silently overwriting new data.
  Date/time fields use Beijing time. Source fields are labelled as collected,
  missing or manually edited; map previews help check WGS84 coordinates.
- Candidates linked to an existing event show differences between the latest
  source fields and the last public event record.
- **审核 → 活动管理** lists both published and unpublished events. Edit details,
  change category/status, reschedule dates, or select **下架**, then save with a
  review note. A cancelled event can remain public to communicate cancellation.
  All changes keep before/after values and the administrator's identity.
- **审核 → 纠错收件箱** supports pending, reviewing, accepted and rejected reports.
  **编辑活动并应用纠错** opens the linked event; **保存活动并接受纠错** commits the
  event edit and correction decision together. Reports that need no event edit
  can be resolved with a written explanation. Private report details stay in admin APIs.
- Stale event edits and correction decisions return 409. An event withdrawn by a
  source change must pass candidate review again before republication.

## Real event data

Showstart is the default ingestion source:

```powershell
docker compose exec api python -m app.ingestion --dry-run --limit 20
docker compose exec api python -m app.ingestion --limit 100
```

Production uses real imported events without a synthetic fallback or fabricated popularity counts. The web map uses OpenStreetMap;
native maps use the device map provider. Missing source facts must be verified by
an administrator; the importer reads Showstart detail addresses, coordinates and
time ranges without guessing event duration or organizer. Administrators can use
**补充详情和地点** on existing candidates. An optional server-side `AMAP_API_KEY`
enables city + venue-name lookup when the source location is incomplete.
Existing demo database rows are preserved but unpublished and excluded by all
public event endpoints. Synthetic fixtures are confined to tests and the explicitly enabled demo service.

## Maps and optional debug mode

The map supports continuous zoom, category controls, collision-aware markers,
location guidance, and nearby publication alerts. Viewport queries paginate and
support areas outside Changsha. Saved event coordinates persist per account.
See [map behavior](docs/MAP_DISPLAY.md) and [location guidance](docs/LOCATION_GUIDANCE.md).

**我的 → 设置** provides an explicit debug switch with a simulated clock, location,
alert replay and performance monitor. Debug mode uses a separate in-memory API
and storage namespace, never production accounts or admin actions. Real data remains
the default. See [demo setup](docs/DEMO_DATA.md) and [debug settings](docs/DEBUG_SETTINGS.md).

## Development and verification

See [backend setup](backend/README.md) and [backend architecture](docs/BACKEND_STRUCTURE.md).
After API changes, run `python -m scripts.export_openapi` in `backend`, then
`npm run generate:api` in `mobile`.

```powershell
# backend (with its virtual environment active)
python -m ruff check app tests
python -m pytest
# Optional real PostGIS integration tests use a temporary schema and roll it back.
$env:CITYPULSE_TEST_POSTGRES = '1'
python -m pytest

# mobile
npm run typecheck
npm run test:map
npm run test:guidance
npx expo export --platform web
npm run smoke:web
```

The browser smoke command serves the built web app on an ephemeral local port and
uses isolated API fixtures to verify roles, review, drafts, corrections, event
management, search and pagination. Real PostGIS tests verify transactions and
Changsha date boundaries separately.
It does not create accounts or publish events in your database.

For deployment, serve the API over HTTPS, set explicit CORS origins and database
credentials, and use a shared edge rate limiter when running multiple workers.
The included login/register limiter is per process. Password recovery, email
verification, and cross-device bookmark synchronization are not implemented.

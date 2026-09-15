# Backend architecture

## Request flow

`app.main` configures FastAPI, CORS and error envelopes. `app.api.router` mounts
public event routes, account routes and administrator review routes under `/api/v1`.
`app.core.database` supplies request-scoped SQLModel sessions.

Routes are grouped by audience and resource, rather than by database model alone:

```text
app/
  api/routes/
    events.py              # Public discovery, map, and detail
    corrections.py         # Public correction submission
    auth.py                # Registration and sessions
    meta.py                # Public category metadata
    admin/
      events.py            # Admin event reads, edits, and revision history
      candidates.py        # Candidate enrichment and approval/rejection
      corrections.py       # Correction inbox and decisions
  services/
    events.py              # Shared audited event update operation
```

Each admin endpoint requires `AdminDep`. The router prefixes preserve the existing
`/api/v1/admin/...` URLs; Swagger groups them as `admin-events`, `admin-candidates`,
and `admin-corrections`.

Both event editing and correction resolution call `services.events.apply_event_update`.
It validates the version, locks rows, updates the event and writes its audit, but
only flushes. The route owns the commit so a correction and its event update remain
one transaction. Routers do not import business operations from other routers.

Public event queries require `is_published=true` and `is_demo=false`. The default
feed and map exclude ended events; `time_scope=past` selects the feed archive.
The map uses a PostGIS
bounding-box query. Event detail includes source evidence and status history.

## Accounts

`app.core.security` implements scrypt hashing, opaque bearer-session lookup and the
current-user/admin dependencies. `users` stores the account role; `auth_sessions`
stores token hashes and expiry. `app.api.routes.auth` handles registration, login,
identity and logout. `app.manage_users` provisions administrators interactively.

Only two roles exist: `regular` and `admin`. Public registration cannot choose a
role. The frontend uses the returned role for navigation; backend dependencies
independently authorize every review request.

## Candidate lifecycle

`app.ingestion.registry` selects an adapter. Website-specific parsers produce
`IngestionItem` facts. `app.ingestion.runner` stores `RawSourceItem` snapshots and
idempotent `EventCandidate` rows, recording persistence runs in `IngestionRun`.
Showstart is the default adapter. No ingestion path publishes automatically.

`app.api.routes.admin.candidates` lists pending/approved/rejected candidates. A decision
locks the candidate and compares its update timestamp with the review form. Approval
creates or updates a linked `Event`, its `EventSourceLink`, and `StatusHistory`,
then records the administrator ID, time and note. All writes commit atomically.
Rejection records the same audit fields and keeps the event unpublished.

Re-importing unchanged source data preserves review decisions. Changed data resets
the candidate to pending and hides its previous public event until reapproval.
The candidate's unique `event_id` prevents duplicate publication on re-review.

## Startup and schema

Docker runs `alembic upgrade head`, `python -m app.bootstrap`, then Uvicorn.
Bootstrap attempts Showstart ingestion; a fetch failure is logged without blocking
startup. `INGESTION_ON_STARTUP` controls this behavior.

Alembic migrations live in `backend/alembic/versions`. Revision `20260912_0005`
adds accounts, sessions and review audit/link fields, and unpublishes legacy demo
records without deleting them. `app.seed` has been removed.

## Contract and frontend

`app.schemas` is the API contract. `python -m scripts.export_openapi` updates
`mobile/openapi.json`; `npm run generate:api` regenerates TypeScript declarations.
Business types in `mobile/src/api/types.ts` reference those declarations.

Admin responses are named explicitly: `AdminCandidate`, `AdminEventDetail`,
`AdminCorrection`, and `AdminEventRevision`. `CorrectionReceipt` is the small public
submission acknowledgement. `EventFields` holds editable facts;
`ReviewedEventFields` adds the expected version and review note. Candidate approval
and admin event updates are separate types built from those common fields.

`CandidateReviewScreen` handles candidate review, while `EventAdministrationScreen`
handles event edits and their correction inbox. `AdminWorkspace` selects the section.

The mobile/web app holds session tokens in memory, keeps account-specific saved
IDs locally, and fetches actual event details. It shows explicit loading, empty
and error states instead of invented fallback records.

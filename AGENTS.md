# CourtMate codebase guide

## Current architecture
- `src/`: original React 19 + TypeScript + Vite Korean SPA. Keep existing UI, Hash Router and `/api/*` endpoints stable.
- `backend/app/`: Python FastAPI API; SQLAlchemy ORM; SQL Server via pyodbc. Input validation + score change history.
- `database/`: vetted SQL Server schema; apply to NEW/EMPTY DB. Do not run automatic create_all in production.
- `legacy/`: original Netlify/Hono/Postgres/Drizzle source for reference only. It is not built or deployed.
- `tools/`: optional JSON export from original API and import into an empty SQL Server database.

## API compatibility and constraints
- Existing React consumes camelCase JSON: `joinedAt`, `playDate`, `sessionId`, `teamA1`, `scoreA`, etc.
- API errors must be `{ "error": "<Korean description>" }` with proper status.
- All session/match inserts/deletes are atomic. Reject duplicate players in a round and duplicate (round,court) assignments. Database also has unique(session_id,round,court).
- Match score updates use integer `scoreVersion` and CAS update. Append `match_score_history` within the same transaction.
- `0:0` means unplayed, but original 7:6 presets remain enabled; no unapproved 0~6 restriction.
- Original pairing algorithm runs in browser; do not silently replace its behavior.
- Authentication is NOT implemented. Do not expose the API publicly without real server-side login + roles.

## Local verification
- Python: `cd backend && python -m pytest -q` with test dependencies; tests use in-memory SQLite only.
- React: `npm ci && npm run typecheck && npm run build` with Node.js 22+.
- Real SQL Server behavior must also be tested in a separate nonproduction DB before deploying.
- Do not commit `.env`, `exports/`, phone-number backups, passwords or compiled output.

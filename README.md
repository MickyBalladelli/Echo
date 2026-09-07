# Echo

Echo is a JavaScript social app with posts, replies, likes, follows, channels, notes, notifications, and real-time chat.

## Stack

- Vite build + Matrix frontend runtime and renderer
- Node.js + Express API
- Socket.IO real-time layer
- PostgreSQL data layer by default, with SQLite (local file) and Turso (libSQL) variants selected by `DB_DIALECT`
- `@mickyballadelli/prism` is the only frontend UI/design system and `@mickyballadelli/matrix` is the only frontend runtime, renderer, state, and router
- No React, Vue, Svelte, or other frontend UI/state/router framework
- Server-local contracts for IDs, timestamps, pagination, and API responses

## Run it

Requirements: Node.js 20+ and either PostgreSQL (`DB_DIALECT=postgres`, default) or SQLite/Turso (`DB_DIALECT=sqlite` with `SQLITE_PATH`, or `DB_DIALECT=turso` with `TURSO_URL` + `TURSO_AUTH_TOKEN`). See `.env.example`.

```sh
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Local SQLite example (`DB_DIALECT=sqlite SQLITE_PATH=./data/echo.sqlite`) needs no database server. Turso example: `DB_DIALECT=turso TURSO_URL=libsql://your-db.turso.io TURSO_AUTH_TOKEN=...`.

Portal runs at `http://localhost:5173`. Server runs at `http://localhost:3000`.

The authenticated portal shell has routes for `/`, `/following`, `/explore`, `/notifications`, `/bookmarks`, `/notes`, `/channels`, `/chat`, `/profile`, and `/hashtags/:tag`. Unknown routes show an accessible 404 state.

## Production shape

```sh
npm run build
npm start
```

The server serves `portal/dist` in production and keeps `/api` for API routes.

For container deployment and operational procedures, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md).

Database commands run from the project root. `db:migrate` applies versioned SQL files from `server/src/db/migrations` for Postgres or `server/src/db/migrations/sqlite` for SQLite/Turso (chosen by `DB_DIALECT`). `db:seed` adds repeatable local users, posts, a channel, a chat, and a notification.

The first account created becomes an admin. On an existing database with no admin, the migration promotes the oldest account. Admins can open `/admin` to change user roles and suspend or reactivate accounts. Developers sit above admins; only another developer can remove developer access.

## API response shape

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": { "nextCursor": null }
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request"
  }
}
```

## Project map

- `portal/` — Vite client
- `portal/src/lib/vendor.js` — the single frontend import boundary for Matrix and Prism
- `server/` — Express and Socket.IO server
- `server/src/http/` — server-local API and validation contracts
- `server/src/db/migrations/` — PostgreSQL schema migrations (`sqlite/` holds the SQLite/Turso variants)
- `server/src/db/models/` — Sequelize models and associations
- `TODO.md` — prioritized product build list
- `MISSING.md` — Prism components Echo needs before the remaining native controls and media can migrate
# Echo

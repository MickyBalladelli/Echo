# Echo deployment

## Container deployment

The root `Dockerfile` builds the portal and packages it with the Node API. The root `docker-compose.yml` runs PostgreSQL with a persistent volume and starts Echo only after PostgreSQL is healthy. The app runs migrations before starting in the compose example, so production operators should still take a backup before deploying a schema change.

```sh
docker compose up -d --build
docker compose logs -f echo
```

The portal, API, and Socket.IO endpoint share port 3000 in production. Put TLS and a single public origin in front of it. Set `CLIENT_ORIGIN` to that exact HTTPS origin. For more than one trusted frontend, set comma-separated `CLIENT_ORIGINS`.

## Turso (libSQL) deployment

To run the API against Turso instead of PostgreSQL, no code changes are needed. The database dialect is selected by `DB_DIALECT`, and migrations automatically use the SQLite/Turso variants in `server/src/db/migrations/sqlite`:

```sh
DB_DIALECT=turso
TURSO_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
```

Run `npm run db:migrate` (and optionally `npm run db:seed`) with the same variables before starting the server. The Postgres service in `docker-compose.yml` is not needed in this mode; the app connects to Turso over HTTPS. For local development without any database server, use `DB_DIALECT=sqlite` with `SQLITE_PATH=./data/echo.sqlite` instead.

Notes:

- The `@libsql/client` dependency must be installed (`npm install` at the repo root syncs `package-lock.json`; without it, `npm ci` and SQLite/Turso mode fail).
- Turso backups replace the PostgreSQL backup procedure in `OPERATIONS.md`: snapshot the Turso database before deploying a schema change.
- SQLite/Turso runs a single writer, so the PostgreSQL advisory-lock step is skipped and migrations apply file by file; every SQLite migration is idempotent (`IF NOT EXISTS`), so a failed run can safely retry.

## Required production settings

- `NODE_ENV=production`
- A strong `DATABASE_URL` or the compose PostgreSQL settings
- Exact `CLIENT_ORIGIN` or `CLIENT_ORIGINS`
- Optional OAuth client credentials and a provider callback URL if OAuth login is enabled
- `LOG_LEVEL=info` or `warn`
- A managed PostgreSQL backup schedule
- TLS termination and websocket upgrade support for `/socket.io`

Socket.IO is stateful per connection. When running multiple app instances, use sticky sessions or a shared Socket.IO adapter, and put health checks on `/api/health`.

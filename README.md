# Echo

Echo is a JavaScript social app. It will have posts, replies, likes, follows, channels, notes, notifications, and real-time chat.

## Stack

- Vite build + Matrix frontend runtime and renderer
- Node.js + Express API
- Socket.IO real-time layer
- PostgreSQL data layer
- `@mickyballadelli/prism` is the only frontend UI/design system and `@mickyballadelli/matrix` is the only frontend runtime, renderer, state, and router
- No React, Vue, Svelte, or other frontend UI/state/router framework
- Server-local contracts for IDs, timestamps, pagination, and API responses

## Run it

Requirements: Node.js 20+ and PostgreSQL.

```sh
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Portal runs at `http://localhost:5000`. Server runs at `http://localhost:3000`.

The authenticated portal shell has routes for `/`, `/following`, `/explore`, `/notifications`, `/bookmarks`, `/notes`, `/channels`, `/chat`, `/profile`, and `/hashtags/:tag`. Unknown routes show an accessible 404 state.

## Production shape

```sh
npm run build
npm start
```

The server serves `portal/dist` in production and keeps `/api` for API routes.

For container deployment and operational procedures, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md).

Database commands run from the project root. `db:migrate` applies versioned SQL files from `server/src/db/migrations`. `db:seed` adds repeatable local users, posts, a channel, a chat, and a notification.

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
- `server/src/db/migrations/` — PostgreSQL schema migrations
- `server/src/db/models/` — Sequelize models and associations
- `TODO.md` — prioritized product build list
# Echo

# Echo deployment

## Container deployment

The root `Dockerfile` builds the portal and packages it with the Node API. The root `docker-compose.yml` runs PostgreSQL with a persistent volume and starts Echo only after PostgreSQL is healthy. The app runs migrations before starting in the compose example, so production operators should still take a backup before deploying a schema change.

```sh
docker compose up -d --build
docker compose logs -f echo
```

The portal, API, and Socket.IO endpoint share port 3000 in production. Put TLS and a single public origin in front of it. Set `CLIENT_ORIGIN` to that exact HTTPS origin. For more than one trusted frontend, set comma-separated `CLIENT_ORIGINS`.

## Required production settings

- `NODE_ENV=production`
- A strong `DATABASE_URL` or the compose PostgreSQL settings
- Exact `CLIENT_ORIGIN` or `CLIENT_ORIGINS`
- `LOG_LEVEL=info` or `warn`
- A managed PostgreSQL backup schedule
- TLS termination and websocket upgrade support for `/socket.io`

Socket.IO is stateful per connection. When running multiple app instances, use sticky sessions or a shared Socket.IO adapter, and put health checks on `/api/health`.

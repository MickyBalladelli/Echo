# Echo operations

## Health

- `GET /api/health/live` checks that the Node process is alive.
- `GET /api/health` checks the process and PostgreSQL readiness.
- PostgreSQL queries have a bounded statement timeout. Tune `DB_QUERY_TIMEOUT_MS` only after checking slow-query logs.

## Backup and restore

Create a custom-format backup:

```sh
DATABASE_URL='postgres://user:password@host:5432/echo' bash scripts/backup-postgres.sh
```

Restore into a new, empty PostgreSQL database first:

```sh
DATABASE_URL='postgres://user:password@host:5432/echo_restore' bash scripts/restore-postgres.sh ./backups/echo-YYYYMMDDTHHMMSSZ.dump
```

Check the restored app against the new database before switching `DATABASE_URL`. Keep backups encrypted, access-controlled, and outside the repository. Run backups daily and test a restore monthly.

## Migration rollback

Migrations are forward-only. Never edit an applied SQL file. If a migration is bad:

1. Stop writes or put the app in maintenance mode.
2. Take a fresh backup.
3. Restore the last known-good backup into a new database, or write a new corrective migration.
4. Deploy the corrective migration and verify `schema_migrations`.
5. Switch traffic only after health and smoke checks pass.

Use `schema_migrations` checksums to detect accidental edits. A rollback is a database recovery operation, not a destructive automatic command.

## Cache and jobs

The current process-local cache keeps channel lists for 15 seconds and popular posts for 5 seconds. It is bounded to 2,000 entries and disappears on restart. For multiple app instances, replace it with Redis and invalidate keys by viewer/feed version.

`server/src/jobs/queue.js` provides bounded in-process queues for notifications and heavy work with retries and graceful draining. Durable work should move to a shared queue such as BullMQ/Redis, SQS, or another managed queue before horizontal scaling. Notification delivery and media processing are the first jobs to move.

## Uploads

The browser currently resizes images before sending data URLs, and the API enforces body and image limits. Production uploads should use private S3-compatible storage (S3, R2, or equivalent): issue short-lived presigned upload URLs, verify MIME and byte limits server-side, scan images, store object keys rather than bytes, and serve through a CDN with immutable hashes.

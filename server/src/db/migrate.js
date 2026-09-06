import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { QueryTypes } from 'sequelize'
import { logger } from '../config/logger.js'
import { isSqlite, sequelize, withTransaction } from './pool.js'

const postgresMigrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))
const sqliteMigrationsDirectory = fileURLToPath(new URL('./migrations/sqlite/', import.meta.url))

const SCHEMA_MIGRATIONS_DDL = isSqlite
  ? `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
    `
  : `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `

async function readMigrations() {
  const directory = isSqlite ? sqliteMigrationsDirectory : postgresMigrationsDirectory
  const names = (await readdir(directory))
    .filter(name => name.endsWith('.sql'))
    .sort()

  return Promise.all(names.map(async name => {
    const sql = await readFile(`${directory}/${name}`, 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    return { name, sql, checksum }
  }))
}

async function applyMigration(migration, transaction) {
  logger.info({ migration: migration.name }, 'Applying database migration')
  if (isSqlite) {
    await sequelize.executeMultiple(migration.sql)
  } else {
    await sequelize.query(migration.sql, { transaction })
  }
  await sequelize.query(
    'INSERT INTO schema_migrations (name, checksum) VALUES (:name, :checksum)',
    {
      replacements: migration,
      ...(transaction ? { transaction } : {})
    }
  )
}

async function migratePostgres(migrations) {
  await withTransaction(async transaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:lockKey))', {
      replacements: { lockKey: 'echo:schema:migrations' },
      transaction
    })

    await sequelize.query(SCHEMA_MIGRATIONS_DDL, { transaction })

    const applied = await sequelize.query(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
      { type: QueryTypes.SELECT, transaction }
    )
    const appliedByName = new Map(applied.map(migration => [migration.name, migration]))

    for (const migration of migrations) {
      const existing = appliedByName.get(migration.name)

      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Migration checksum changed: ${migration.name}`)
        }

        continue
      }

      await applyMigration(migration, transaction)
    }
  })
}

async function migrateSqlite(migrations) {
  // SQLite and Turso run a single writer, so migrations apply file by file
  // without the PostgreSQL advisory lock. Every sqlite migration is written
  // to be idempotent (IF NOT EXISTS), so a failed run can safely retry.
  await sequelize.executeMultiple(SCHEMA_MIGRATIONS_DDL)

  const applied = await sequelize.query(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
    { type: QueryTypes.SELECT }
  )
  const appliedByName = new Map(applied.map(migration => [migration.name, migration]))

  for (const migration of migrations) {
    const existing = appliedByName.get(migration.name)

    if (existing) {
      if (existing.checksum !== migration.checksum) {
        throw new Error(`Migration checksum changed: ${migration.name}`)
      }

      continue
    }

    await applyMigration(migration, null)
  }
}

async function migrate() {
  const migrations = await readMigrations()

  if (isSqlite) {
    await migrateSqlite(migrations)
  } else {
    await migratePostgres(migrations)
  }

  logger.info({ count: migrations.length, dialect: isSqlite ? 'sqlite' : 'postgres' }, 'Database migrations complete')
}

try {
  await migrate()
} catch (error) {
  logger.error({ err: error }, 'Database migration failed')
  process.exitCode = 1
} finally {
  await sequelize.close()
}

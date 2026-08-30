import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { QueryTypes } from 'sequelize'
import { logger } from '../config/logger.js'
import { sequelize, withTransaction } from './pool.js'

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))

async function readMigrations() {
  const names = (await readdir(migrationsDirectory))
    .filter(name => name.endsWith('.sql'))
    .sort()

  return Promise.all(names.map(async name => {
    const sql = await readFile(`${migrationsDirectory}/${name}`, 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    return { name, sql, checksum }
  }))
}

async function migrate() {
  const migrations = await readMigrations()

  await withTransaction(async transaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:lockKey))', {
      replacements: { lockKey: 'echo:schema:migrations' },
      transaction
    })

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, { transaction })

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

      logger.info({ migration: migration.name }, 'Applying database migration')
      await sequelize.query(migration.sql, { transaction })
      await sequelize.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES (:name, :checksum)',
        {
          replacements: migration,
          transaction
        }
      )
    }
  })

  logger.info({ count: migrations.length }, 'Database migrations complete')
}

try {
  await migrate()
} catch (error) {
  logger.error({ err: error }, 'Database migration failed')
  process.exitCode = 1
} finally {
  await sequelize.close()
}

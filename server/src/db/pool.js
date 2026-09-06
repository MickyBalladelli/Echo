import { QueryTypes, Sequelize } from 'sequelize'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { bindNamedParameters, isSqliteDialect, translateSqlForSqlite } from './dialect.js'

export { QueryTypes }

export const dbDialect = env.dbDialect
export const isSqlite = isSqliteDialect(dbDialect)

const SQLITE_TX = Symbol('sqlite-tx')

function createPostgresSequelize() {
  const instance = new Sequelize(env.databaseUrl, {
    dialect: 'postgres',
    logging: env.nodeEnv === 'development'
      ? (message, timing) => logger.debug({ message, timing }, 'Database query')
      : false,
    benchmark: true,
    dialectOptions: {
      statement_timeout: env.dbQueryTimeoutMs,
      connectionTimeoutMillis: env.dbConnectionTimeoutMs
    },
    pool: {
      max: 10,
      idle: 30000,
      acquire: 5000
    }
  })

  instance.afterConnect((_connection, config) => {
    logger.debug({ database: config.database }, 'PostgreSQL connection opened')
  })

  instance.afterDisconnect(_connection => {
    logger.debug('PostgreSQL connection closed')
  })

  return instance
}

function createLibsqlClientLoader() {
  let clientPromise = null

  async function load() {
    if (!clientPromise) {
      clientPromise = (async () => {
        let createClient
        try {
          ;({ createClient } = await import('@libsql/client'))
        } catch (error) {
          throw new Error(
            'SQLite/Turso support needs the @libsql/client package. Run `npm install` in Echo/server.',
            { cause: error }
          )
        }
        if (dbDialect === 'turso') {
          const client = createClient({
            url: env.tursoUrl,
            ...(env.tursoAuthToken ? { authToken: env.tursoAuthToken } : {})
          })
          logger.info('Using Turso database')
          return client
        }
        const url = env.sqlitePath.startsWith('file:') ? env.sqlitePath : `file:${env.sqlitePath}`
        const filePath = url.slice('file:'.length)
        if (filePath && filePath !== ':memory:') {
          await mkdir(dirname(filePath) || '.', { recursive: true })
        }
        const client = createClient({ url })
        await client.execute('PRAGMA journal_mode = WAL').catch(() => {})
        await client.execute('PRAGMA foreign_keys = ON').catch(() => {})
        logger.info({ url }, 'Using SQLite database')
        return client
      })()
    }
    return clientPromise
  }

  async function close() {
    if (!clientPromise) return
    const client = await clientPromise.catch(() => null)
    if (client && typeof client.close === 'function') {
      await client.close()
    }
    clientPromise = null
  }

  return { load, close }
}

function createSqliteSequelize() {
  const { load, close } = createLibsqlClientLoader()

  async function runQuery(sqlText, options = {}) {
    const translated = translateSqlForSqlite(sqlText)
    if (env.nodeEnv === 'development') {
      logger.debug({ dialect: dbDialect }, 'Database query')
    }
    const { sql, args } = bindNamedParameters(translated, options.replacements)
    const executor = options.transaction?.[SQLITE_TX] ?? await load()
    const result = await executor.execute({ sql, args })
    const rows = Array.isArray(result.rows) ? result.rows : []
    if (options.type === QueryTypes.SELECT || options.type === 'SELECT') {
      return rows
    }
    return [rows, result.rowsAffected ?? rows.length]
  }

  async function runTransaction(callback) {
    const client = await load()
    if (client && typeof client.transaction === 'function') {
      const tx = await client.transaction('write')
      try {
        const result = await callback({ [SQLITE_TX]: tx })
        await tx.commit()
        return result
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    }
    await client.execute('BEGIN IMMEDIATE')
    try {
      const result = await callback({ [SQLITE_TX]: client })
      await client.execute('COMMIT')
      return result
    } catch (error) {
      await client.execute('ROLLBACK').catch(() => {})
      throw error
    }
  }

  return {
    getDialect: () => 'sqlite',
    query: (sqlText, options) => runQuery(sqlText, options),
    transaction: callback => runTransaction(callback),
    executeMultiple: async sqlText => {
      const client = await load()
      if (typeof client.executeMultiple === 'function') {
        await client.executeMultiple(sqlText)
        return
      }
      await client.execute(sqlText)
    },
    close: () => close(),
    afterConnect: () => {},
    afterDisconnect: () => {},
    define: () => {
      throw new Error('Sequelize models require DB_DIALECT=postgres. SQLite and Turso use raw queries through pool.js.')
    }
  }
}

export const sequelize = isSqlite ? createSqliteSequelize() : createPostgresSequelize()

export const pool = sequelize

export async function query(sql, replacements = undefined, options = {}) {
  if (!isSqlite) {
    return sequelize.query(sql, {
      ...options,
      ...(replacements === undefined ? {} : { replacements })
    })
  }
  return sequelize.query(sql, {
    ...options,
    ...(replacements === undefined ? {} : { replacements })
  })
}

export function withTransaction(callback) {
  return sequelize.transaction(callback)
}

export async function checkDatabaseHealth() {
  await sequelize.query('SELECT 1 AS healthy', { type: QueryTypes.SELECT })
  return true
}

export async function profiledQuery(name, sql, options = {}) {
  const startedAt = process.hrtime.bigint()
  try {
    return await sequelize.query(sql, options)
  } finally {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const log = durationMs >= env.dbProfileSlowMs ? logger.warn.bind(logger) : logger.debug.bind(logger)
    log({ queryName: name, durationMs: Math.round(durationMs * 100) / 100 }, 'Database query profile')
  }
}

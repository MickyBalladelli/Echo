import { Sequelize } from 'sequelize'
import { QueryTypes } from 'sequelize'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

export const sequelize = new Sequelize(env.databaseUrl, {
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

export const pool = sequelize

export async function query(sql, replacements = undefined, options = {}) {
  return sequelize.query(sql, {
    ...options,
    ...(replacements === undefined ? {} : { replacements })
  })
}

sequelize.afterConnect((_connection, config) => {
  logger.debug({ database: config.database }, 'PostgreSQL connection opened')
})

sequelize.afterDisconnect(_connection => {
  logger.debug('PostgreSQL connection closed')
})

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

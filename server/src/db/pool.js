import { Sequelize } from 'sequelize'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: env.nodeEnv === 'development'
    ? (message, timing) => logger.debug({ message, timing }, 'Database query')
    : false,
  benchmark: true,
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

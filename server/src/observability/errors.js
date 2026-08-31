import { logger } from '../config/logger.js'

let errorTracker = null

export function setErrorTracker(tracker) {
  errorTracker = tracker
}

export function captureError(error, context = {}) {
  if (errorTracker?.captureException) {
    try {
      errorTracker.captureException(error, context)
      return
    } catch (trackerError) {
      logger.error({ err: trackerError }, 'Error tracker failed')
    }
  }

  logger.debug({ errorCode: error.code, ...context }, 'Error tracking integration point')
}

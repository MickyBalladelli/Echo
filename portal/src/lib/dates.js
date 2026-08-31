const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: userTimeZone
})
const monthYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: userTimeZone
})
const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: userTimeZone
})

function parseDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value) {
  const date = parseDate(value)
  return date ? dateTimeFormatter.format(date) : 'recently'
}

export function formatMonthYear(value) {
  const date = parseDate(value)
  return date ? monthYearFormatter.format(date) : 'recently'
}

export function formatClockTime(value) {
  const date = parseDate(value)
  return date ? clockFormatter.format(date) : '—'
}

export function formatRelativeTime(value) {
  const date = parseDate(value)
  if (!date) return 'recently'

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: userTimeZone
  }).format(date)
}

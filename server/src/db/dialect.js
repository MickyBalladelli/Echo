import { env } from '../config/env.js'

export const dbDialect = env.dbDialect

export function isSqliteDialect(dialect = dbDialect) {
  return dialect === 'sqlite' || dialect === 'turso'
}

export function isSqlite() {
  return isSqliteDialect()
}

export function isPostgres() {
  return dbDialect === 'postgres'
}

const SQLITE_UUID_V4 = `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`
const SQLITE_NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`

function splitLiterals(sql) {
  const parts = []
  let current = ''
  let i = 0
  let inString = false
  while (i < sql.length) {
    const char = sql[i]
    if (!inString && char === "'") {
      if (current) parts.push({ text: current, literal: false })
      current = "'"
      inString = true
      i += 1
    } else if (inString && char === "'") {
      if (sql[i + 1] === "'") {
        current += "''"
        i += 2
      } else {
        current += "'"
        parts.push({ text: current, literal: true })
        current = ''
        inString = false
        i += 1
      }
    } else {
      current += char
      i += 1
    }
  }
  if (current) parts.push({ text: current, literal: inString })
  return parts
}

function matchParen(text, openIndex) {
  let depth = 0
  let inString = false
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (char === "'") {
        if (text[i + 1] === "'") i += 1
        else inString = false
      }
      continue
    }
    if (char === "'") {
      inString = true
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return { start: openIndex, end: i, inner: text.slice(openIndex + 1, i) }
      }
    }
  }
  return null
}

function findOpenParenBefore(text, closeIndex) {
  let depth = 0
  for (let i = closeIndex; i >= 0; i -= 1) {
    if (text[i] === ')') depth += 1
    else if (text[i] === '(') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let inString = false
  let current = ''
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      current += char
      if (char === "'") {
        if (text[i + 1] === "'") {
          current += "'"
          i += 1
        } else {
          inString = false
        }
      }
      continue
    }
    if (char === "'") {
      inString = true
      current += char
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current.trim())
  return parts
}

function splitCastExpression(inner) {
  let depth = 0
  let inString = false
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i]
    if (inString) {
      if (char === "'") {
        if (inner[i + 1] === "'") i += 1
        else inString = false
      }
      continue
    }
    if (char === "'") {
      inString = true
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (depth === 0 && (char === 'A' || char === 'a')) {
      const rest = inner.slice(i)
      const asMatch = rest.match(/^[Aa][Ss](?![A-Za-z0-9_])/)
      if (asMatch) {
        const before = inner.slice(0, i)
        if (/[\s)]$/.test(before) || before === '') {
          return [before.trim(), inner.slice(i + asMatch[0].length).trim()]
        }
      }
    }
  }
  return null
}

function rewriteCalls(code, name, replacer) {
  const pattern = new RegExp(`\\b${name}\\s*\\(`, 'gi')
  let output = ''
  let cursor = 0
  let match = pattern.exec(code)
  while (match) {
    const openIndex = code.indexOf('(', match.index)
    const group = matchParen(code, openIndex)
    if (!group) break
    const args = splitTopLevel(group.inner)
    output += code.slice(cursor, match.index) + replacer(args, group.inner)
    cursor = group.end + 1
    pattern.lastIndex = cursor
    match = pattern.exec(code)
  }
  return output + code.slice(cursor)
}

function rewriteCast(code) {
  return rewriteCalls(code, 'CAST', (args, inner) => {
    const split = splitCastExpression(inner)
    if (!split) return `CAST(${inner})`
    const [expression, rawType] = split
    const type = rawType.trim().toUpperCase().replace(/\s+/g, ' ')
    if (type === 'JSONB') return `CAST(${expression} AS TEXT)`
    if (type === 'TEXT[]') return expression
    if (['TIMESTAMPTZ', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP', 'UUID', 'INET'].includes(type)) return expression
    return `CAST(${expression} AS ${rawType.trim()})`
  })
}

function rewriteFullSqlFunctions(sql) {
  let result = sql
  result = rewriteCast(result)
  result = rewriteCalls(result, 'DATE_TRUNC', args => {
    if (args.length === 2 && args[0].replace(/['\s]/g, '').toLowerCase() === 'day') {
      return `date(${args[1]})`
    }
    return `DATE_TRUNC(${args.join(', ')})`
  })
  result = rewriteCalls(result, 'ARRAY_TO_STRING', args => args[0] || `ARRAY_TO_STRING(${args.join(', ')})`)
  result = rewriteCalls(result, 'CONCAT', args => `(${args.join(' || ')})`)
  return result
}

function rewriteTupleComparisons(code) {
  const pattern = /\)\s*<\s*\(/g
  let output = ''
  let cursor = 0
  let match = pattern.exec(code)
  while (match) {
    const leftClose = match.index
    const rightOpen = match[0].lastIndexOf('(') + match.index
    const leftOpen = findOpenParenBefore(code, leftClose)
    if (leftOpen === -1) {
      match = pattern.exec(code)
      continue
    }
    const beforeChar = leftOpen > 0 ? code[leftOpen - 1] : ' '
    if (/[A-Za-z0-9_.)"']/.test(beforeChar)) {
      pattern.lastIndex = leftClose + 1
      match = pattern.exec(code)
      continue
    }
    const rightGroup = matchParen(code, rightOpen)
    if (!rightGroup) break
    const leftParts = splitTopLevel(code.slice(leftOpen + 1, leftClose))
    const rightParts = splitTopLevel(rightGroup.inner)
    if (leftParts.length < 2 || leftParts.length !== rightParts.length) {
      pattern.lastIndex = rightGroup.end + 1
      output += code.slice(cursor, rightGroup.end + 1)
      cursor = rightGroup.end + 1
      match = pattern.exec(code)
      continue
    }
    const branches = leftParts.map((left, index) => {
      const equalities = leftParts
        .slice(0, index)
        .map((previous, previousIndex) => `${previous} = ${rightParts[previousIndex]}`)
      return [...equalities, `${left} < ${rightParts[index]}`].join(' AND ')
    })
    output += code.slice(cursor, leftOpen) + `(${branches.map(branch => `(${branch})`).join(' OR ')})`
    cursor = rightGroup.end + 1
    pattern.lastIndex = cursor
    match = pattern.exec(code)
  }
  return output + code.slice(cursor)
}

function rewriteAny(code) {
  const pattern = /([:\w."]+)\s*=\s*ANY\s*\(/gi
  let output = ''
  let cursor = 0
  let match = pattern.exec(code)
  while (match) {
    const openIndex = code.indexOf('(', match.index + match[0].length - 1)
    const group = matchParen(code, openIndex)
    if (!group) break
    output += `${code.slice(cursor, match.index)}EXISTS (SELECT 1 FROM json_each(${group.inner}) WHERE value = ${match[1]})`
    cursor = group.end + 1
    pattern.lastIndex = cursor
    match = pattern.exec(code)
  }
  return output + code.slice(cursor)
}

const CAST_SUFFIX = /::\s*(?:TEXT\s*\[\]|TIMESTAMPTZ|TIMESTAMP\s+WITH\s+TIME\s+ZONE|JSONB|UUID|INET|TEXT|DATE|INTEGER|INT|BIGINT|SMALLINT|BOOLEAN|VARCHAR\s*\(\s*\d+\s*\)|CHAR\s*\(\s*\d+\s*\)|NUMERIC\s*\([\d\s,]+\))/gi

function stripCastSuffixes(code) {
  return code.replace(CAST_SUFFIX, '')
}

function rewriteCodeSegment(code) {
  let result = code
  result = rewriteTupleComparisons(result)
  result = stripCastSuffixes(result)
  result = rewriteAny(result)
  result = result
    .replace(/\bjsonb_build_object\s*\(/gi, 'json_object(')
    .replace(/\bjsonb_agg\s*\(/gi, 'json_group_array(')
    .replace(/\bjsonb_array_length\s*\(/gi, 'json_array_length(')
    .replace(/\bchar_length\s*\(/gi, 'length(')
    .replace(/\bGREATEST\s*\(/gi, 'max(')
    .replace(/\bLEAST\s*\(/gi, 'min(')
    .replace(/\bILIKE\b/g, 'LIKE')
    .replace(/(^|\s+)FOR\s+(NO\s+KEY\s+)?UPDATE(\s+SKIP\s+LOCKED)?\b/gi, '$1')
    .replace(/\bCURRENT_TIMESTAMP\b/gi, SQLITE_NOW)
    .replace(/\bgen_random_uuid\s*\(\s*\)/gi, SQLITE_UUID_V4)
  return result
}

export function translateSqlForSqlite(sql) {
  const normalized = rewriteFullSqlFunctions(sql)
  const withIntervals = normalized
    .replace(/CURRENT_TIMESTAMP\s*-\s*\(\s*:(\w+)\s*\*\s*INTERVAL\s*'1 day'\s*\)/gi, `datetime('now', '-' || :$1 || ' days')`)
    .replace(/CURRENT_TIMESTAMP\s*([+-])\s*INTERVAL\s*'(\d+)\s*(days?|hours?|minutes?|months?|years?)'/gi, `datetime('now', '$1$2 $3')`)
  const parts = splitLiterals(withIntervals)
  let output = ''
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part.literal) {
      output += part.text
      continue
    }
    let code = rewriteCodeSegment(part.text)
    const previous = parts[index - 1]
    if (previous?.literal) {
      code = code.replace(new RegExp(`^${CAST_SUFFIX.source}`, CAST_SUFFIX.flags), '')
    }
    output += code
  }
  return output
}

export function normalizeReplacementValue(value) {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return JSON.stringify(value)
  return value
}

export function bindNamedParameters(sql, replacements = {}) {
  if (Array.isArray(replacements)) return { sql, args: replacements.map(normalizeReplacementValue) }
  const parts = splitLiterals(sql)
  const args = []
  let output = ''
  for (const part of parts) {
    if (part.literal) {
      output += part.text
      continue
    }
    output += part.text.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
      if (!(name in replacements)) {
        throw new Error(`Missing SQL replacement: ${name}`)
      }
      args.push(normalizeReplacementValue(replacements[name]))
      return '?'
    })
  }
  return { sql: output, args }
}

export function asJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text)
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

export function asJsonArray(value) {
  const parsed = asJson(value, [])
  return Array.isArray(parsed) ? parsed : []
}

export function asTags(value) {
  if (Array.isArray(value)) return value.filter(tag => typeof tag === 'string')
  return asJsonArray(value).filter(tag => typeof tag === 'string')
}

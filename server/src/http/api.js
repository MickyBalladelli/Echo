export function ok(data, meta = undefined) {
  return {
    ok: true,
    data,
    ...(meta ? { meta } : {})
  }
}

export function fail(code, message, details = undefined) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  }
}

export function cursorMeta(nextCursor = null) {
  return { nextCursor }
}

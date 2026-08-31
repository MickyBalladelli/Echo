function storageKey(scope) {
  return `echo:offline-draft:${scope || 'home'}`
}

export function readOfflineDraft(scope) {
  if (typeof localStorage === 'undefined') return null
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(scope)) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export function writeOfflineDraft(scope, draft) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
  } catch {}
}

export function clearOfflineDraft(scope) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(storageKey(scope))
  } catch {}
}

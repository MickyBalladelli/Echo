const readRequired = (name, fallback) => {
  const value = import.meta.env[name] || fallback

  if (!value) {
    throw new Error(`Missing portal environment variable: ${name}`)
  }

  return value
}

export const clientEnv = Object.freeze({
  apiUrl: readRequired('VITE_API_URL', window.location.origin),
  socketUrl: readRequired('VITE_SOCKET_URL', window.location.origin)
})

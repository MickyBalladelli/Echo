export const supportedLocales = Object.freeze(['en', 'fr', 'de', 'es', 'it', 'ja'])

export function getAppLocale() {
  if (typeof document === 'undefined') return 'en'
  const locale = document.documentElement.lang?.slice(0, 2)
  return supportedLocales.includes(locale) ? locale : 'en'
}

export function setAppLocale(locale) {
  if (typeof document !== 'undefined' && supportedLocales.includes(locale)) document.documentElement.lang = locale
}

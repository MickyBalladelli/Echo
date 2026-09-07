import { computed, html, onMount, signal } from '../lib/vendor.js'
import { AutoComplete } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

function currentToken(value, allowMultiple) {
  const text = String(value ?? '')
  if (!allowMultiple) return { prefix: '', query: text.trim() }

  const match = text.match(/(^|,)(\s*)([^,]*)$/)
  if (!match) return { prefix: '', query: text.trim() }

  return {
    prefix: text.slice(0, match.index) + match[1] + match[2],
    query: match[3].trim()
  }
}

function readBoolean(value) {
  return value && typeof value === 'object' && 'value' in value
    ? Boolean(value.value)
    : Boolean(value)
}

export function ChatUserAutocomplete({ value, allowMultiple = false, onInput, onSelect, ...props }) {
  const options = signal([])
  const users = signal([])
  const loading = signal(false)
  const noOptionsText = computed(() => currentToken(value.value, readBoolean(allowMultiple)).query.length < 2
    ? 'Type at least 2 characters'
    : 'No matching users')
  let searchTimer
  let searchVersion = 0

  function clearSearch() {
    clearTimeout(searchTimer)
    searchVersion += 1
    options.value = []
    users.value = []
    loading.value = false
  }

  function scheduleSearch() {
    const { query, prefix } = currentToken(value.value, readBoolean(allowMultiple))
    clearTimeout(searchTimer)

    if (query.length < 2) {
      searchVersion += 1
      options.value = []
      users.value = []
      loading.value = false
      return
    }

    const version = ++searchVersion
    loading.value = true
    searchTimer = setTimeout(async () => {
      try {
        const result = await apiRequest(`/api/search?q=${encodeURIComponent(query)}&type=users&limit=8`)
        if (version !== searchVersion) return
        users.value = result.data
        options.value = result.data.map(user => ({
          value: `${prefix}${user.username}`,
          label: `${prefix}${user.username}`
        }))
      } catch {
        if (version !== searchVersion) return
        users.value = []
        options.value = []
      } finally {
        if (version === searchVersion) loading.value = false
      }
    }, 140)
  }

  function renderOption(option) {
    const username = String(option.value).split(',').at(-1).trim()
    const user = users.value.find(item => item.username === username)
    const displayName = user?.profile?.displayName
    return html`<span class="chat-user-suggestion"><strong>@${username}</strong>${displayName && displayName !== username ? html`<span>${displayName}</span>` : ''}</span>`
  }

  function selectOption(option, event) {
    if (readBoolean(allowMultiple)) value.value = `${option.value}, `
    clearSearch()
    onSelect?.(option, event)
  }

  onMount(() => {
    const unsubscribe = value.subscribe(scheduleSearch)
    return () => {
      clearTimeout(searchTimer)
      searchVersion += 1
      unsubscribe()
    }
  })

  return (
    <AutoComplete
      {...props}
      value={value}
      options={options}
      loading={loading}
      loadingText="Searching users…"
      noOptionsText={noOptionsText}
      minChars={0}
      openOnFocus={false}
      onInput={onInput}
      onSelect={selectOption}
      onRender={renderOption}
    />
  )
}

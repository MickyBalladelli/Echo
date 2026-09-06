import { computed, effect, onMount, signal } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

const emojiCategories = Object.freeze([
  { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤯', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
  { label: 'People', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤝', '👏', '🙌', '👐', '🤲', '🙏', '💪', '🫶', '👀', '👁️', '🧠', '👄', '💋', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '🧔', '👮', '🕵️', '💃', '🕺', '👯', '🧘', '🏃', '🚶', '🤸', '🏄', '🏆', '🎖️', '🎉', '🎊'] },
  { label: 'Animals & nature', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🐌', '🐞', '🐜', '🕷️', '🐢', '🐍', '🦎', '🐙', '🦀', '🐠', '🐟', '🐡', '🐬', '🐳', '🌸', '🌹', '🌻', '🌈', '⭐', '🌟', '✨', '🔥', '☀️', '🌙', '⚡', '❄️'] },
  { label: 'Food & drink', emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥕', '🌽', '🌶️', '🍔', '🍟', '🍕', '🌭', '🌮', '🌯', '🥗', '🍿', '🍩', '🍪', '🎂', '🍰', '🍫', '🍭', '☕', '🍵', '🥤', '🍺', '🍻', '🍷', '🥂', '🍸', '🍹', '🥃'] },
  { label: 'Objects & symbols', emojis: ['💎', '💡', '🎈', '🎁', '🎵', '🎶', '📣', '📌', '🚀', '🛸', '💬', '💭', '✅', '❌', '❗', '❓', '‼️', '⁉️', '💯', '🔔', '🔒', '🔑', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💖', '💗', '💓', '💞', '💘', '💝', '💟', '☮️', '✝️', '☪️', '☯️', '♻️', '⚠️', '🚫', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪'] }
])

const gifOptions = Object.freeze([
  { label: 'Celebration', url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif' },
  { label: 'Thumbs up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { label: 'Excited', url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif' },
  { label: 'Applause', url: 'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif' },
  { label: 'High five', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { label: 'Dance', url: 'https://media.giphy.com/media/3o6Zt6D8W8k2Q8w8k8/giphy.gif' },
  { label: 'Enthusiastic thumbs up', url: 'https://media2.giphy.com/media/3o6YfWVyo3JkdrNO92/giphy.gif' },
  { label: 'Cool thumbs up', url: 'https://media1.tenor.com/m/sHGKHnikkM0AAAAC/thumbsup-cool.gif' },
  { label: 'Simon Cowell approval', url: 'https://c.tenor.com/XTsLyyT2KRgAAAAC/thumbs-up-simon-cowell.gif' },
  { label: 'Excellent', url: 'https://gifdb.com/images/high/excellent-emma-the-wiggles-qa7by6rs542650jz.gif' },
  { label: 'Impressive applause', url: 'https://gifdb.com/images/file/applause-clapping-impressive-yes-o9o6qz2x1gl3bzng.gif' },
  { label: 'Wow celebration', url: 'https://media1.tenor.com/m/cKsK-Nu-wuAAAAAC/celebration-gif-celebrations.gif' },
  { label: 'Wow applause', url: 'https://media1.tenor.com/m/cOlmQ_vFDVAAAAAC/woah-amazed.gif' },
  { label: 'Happy laugh', url: 'https://media1.tenor.com/m/x4-37ZYaeagAAAAC/black-guy-happy.gif' },
  { label: 'Big laugh', url: 'https://media1.giphy.com/media/Bh7J3aA2ffe5ujSFVi/giphy.gif' }
])

const stickerOptions = Object.freeze([
  { label: 'Nice', value: '👏✨' },
  { label: 'Love', value: '😍❤️' },
  { label: 'Wow', value: '🤯⭐' },
  { label: 'Party', value: '🎉🥳' },
  { label: 'Yes', value: '✅🙌' },
  { label: 'No words', value: '😶💬' }
])

function filterBuiltInGifs(query) {
  return query
    ? gifOptions.filter(gif => gif.label.toLowerCase().includes(query))
    : gifOptions
}

export function ChannelReactionPicker({ open, position, onSelect, onClose, canUseRichReactions = false }) {
  const activeTab = signal('emoji')
  const search = signal('')
  const gifs = signal(gifOptions)
  const gifLoading = signal(false)
  const gifProviderConfigured = signal(false)
  const gifNextOffset = signal(null)
  let gifSearchTimer = null
  let gifRequestId = 0

  async function loadGifs({ append = false } = {}) {
    if (!canUseRichReactions || (append && gifNextOffset.value === null)) return
    const query = search.value.trim()
    const offset = append ? gifNextOffset.value : 0
    const requestId = ++gifRequestId
    gifLoading.value = true
    try {
      const result = await apiRequest(`/api/gifs/search?q=${encodeURIComponent(query)}&limit=24&offset=${offset}`)
      if (requestId !== gifRequestId) return
      const data = result.data || {}
      const received = Array.isArray(data.gifs) ? data.gifs : []
      gifProviderConfigured.value = Boolean(data.configured)
      gifs.value = append
        ? [...gifs.value, ...received]
        : data.configured ? received : filterBuiltInGifs(query)
      gifNextOffset.value = data.configured ? data.nextOffset ?? null : null
    } catch {
      if (requestId !== gifRequestId) return
      gifProviderConfigured.value = false
      gifs.value = filterBuiltInGifs(query)
      gifNextOffset.value = null
    } finally {
      if (requestId === gifRequestId) gifLoading.value = false
    }
  }

  function selectTab(tabId) {
    activeTab.value = tabId
  }

  effect(() => {
    search.value
    if (activeTab.value !== 'gif' || !open?.value) return
    clearTimeout(gifSearchTimer)
    gifSearchTimer = setTimeout(() => loadGifs(), 300)
  })

  function handleKeyDown(event) {
    if (event.key === 'Escape') onClose?.()
  }

  onMount(() => {
    const handleDocumentKeyDown = event => {
      if (event.key === 'Escape' && open?.value) onClose?.()
    }
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown)
      clearTimeout(gifSearchTimer)
    }
  })

  function choose(type, value, label) {
    onSelect?.({ type, value, label })
  }

  const tabs = [
    { id: 'emoji', label: 'Emoji' },
    ...(canUseRichReactions
      ? [
        { id: 'gif', label: 'GIFs' },
        { id: 'sticker', label: 'Stickers' }
      ]
      : [])
  ]
  const popupStyle = computed(() => {
    const pickerPosition = position?.value || { top: 12, left: 12 }
    return `top: ${pickerPosition.top}px; left: ${pickerPosition.left}px; display: ${open?.value ? 'grid' : 'none'}`
  })
  const popupHidden = computed(() => open?.value ? 'false' : 'true')
  const searchPlaceholder = computed(() => activeTab.value === 'emoji' ? 'Search emoji' : `Search ${activeTab.value === 'gif' ? 'GIFs' : 'stickers'}`)
  const searchAriaLabel = computed(() => `Search ${activeTab.value}`)
  const tabView = computed(() => (
    <div class="channel-chat-reaction-tabs" role="tablist" aria-label="Reaction types">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab.value === tab.id}
          class={activeTab.value === tab.id ? 'is-active' : ''}
          onClick={() => selectTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ))
  const contentView = computed(() => {
    const query = search.value.trim().toLowerCase()
    const stickers = query ? stickerOptions.filter(sticker => sticker.label.toLowerCase().includes(query)) : stickerOptions
    if (activeTab.value === 'emoji') {
      return (
        <div class="channel-chat-emoji-content">
          {emojiCategories.map(category => {
            const emojis = query ? category.emojis.filter(emoji => emoji.includes(query)) : category.emojis
            if (!emojis.length) return null
            return (
              <section key={category.label} class="channel-chat-emoji-category" aria-label={category.label}>
                <h4>{category.label}</h4>
                <div class="channel-chat-emoji-grid">
                  {emojis.map(emoji => (
                    <button key={emoji} class="channel-chat-reaction-option" type="button" aria-label={`React with ${emoji}`} onClick={() => choose('emoji', emoji, emoji)}>{emoji}</button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )
    }
    if (canUseRichReactions && activeTab.value === 'gif') {
      return (
        <div class="channel-chat-gif-grid">
          {gifs.value.map(gif => (
            <button key={gif.id || gif.url} class="channel-chat-gif-option" type="button" aria-label={`Use ${gif.title || gif.label} GIF`} onClick={() => choose('gif', gif.url, gif.title || gif.label)}>
              <img src={gif.previewUrl || gif.url} alt={gif.title || gif.label} loading="lazy" />
            </button>
          ))}
          {gifLoading.value && <p class="channel-chat-reaction-empty">Loading GIFs…</p>}
          {!gifLoading.value && !gifs.value.length && <p class="channel-chat-reaction-empty">No GIFs found</p>}
          {!gifLoading.value && !gifProviderConfigured.value && <p class="channel-chat-reaction-empty">Add GIPHY_API_KEY for live search</p>}
          {!gifLoading.value && gifNextOffset.value !== null && (
            <button class="channel-chat-gif-load-more" type="button" onClick={() => loadGifs({ append: true })}>Load more GIFs</button>
          )}
        </div>
      )
    }
    if (canUseRichReactions && activeTab.value === 'sticker') {
      return (
        <div class="channel-chat-sticker-grid">
          {stickers.map(sticker => (
            <button key={sticker.label} class="channel-chat-sticker-option" type="button" aria-label={`Use ${sticker.label} sticker`} onClick={() => choose('sticker', sticker.value, sticker.label)}>
              <span aria-hidden="true">{sticker.value}</span>
              <small>{sticker.label}</small>
            </button>
          ))}
          {!stickers.length && <p class="channel-chat-reaction-empty">No stickers found</p>}
        </div>
      )
    }
    return null
  })

  return (
    <div
      class="channel-chat-reaction-popover"
      role="dialog"
      aria-label="Choose a reaction"
      aria-hidden={popupHidden}
      tabIndex="-1"
      onKeyDown={handleKeyDown}
      style={popupStyle}
    >
      <div class="channel-chat-reaction-popover-header">
        <strong>React</strong>
        <button type="button" class="channel-chat-reaction-close" aria-label="Close reactions" onClick={onClose}>×</button>
      </div>
      {tabView}
      <input
        class="channel-chat-reaction-search"
        type="search"
        placeholder={searchPlaceholder}
        aria-label={searchAriaLabel}
        use:bind={{ source: search, debounce: 250 }}
      />
      {contentView}
    </div>
  )
}

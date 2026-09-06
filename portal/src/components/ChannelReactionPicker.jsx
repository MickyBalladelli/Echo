import { computed, signal } from '../lib/vendor.js'

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
  { label: 'Dance', url: 'https://media.giphy.com/media/3o6Zt6D8W8k2Q8w8k8/giphy.gif' }
])

const stickerOptions = Object.freeze([
  { label: 'Nice', value: '👏✨' },
  { label: 'Love', value: '😍❤️' },
  { label: 'Wow', value: '🤯⭐' },
  { label: 'Party', value: '🎉🥳' },
  { label: 'Yes', value: '✅🙌' },
  { label: 'No words', value: '😶💬' }
])

export function ChannelReactionPicker({ open, position, onSelect, onClose }) {
  const activeTab = signal('emoji')
  const search = signal('')

  function choose(type, value, label) {
    onSelect?.({ type, value, label })
  }

  const picker = computed(() => {
    if (!open?.value) return null

    const query = search.value.trim().toLowerCase()
    const pickerPosition = position?.value || { top: 12, left: 12 }
    const tabs = [
      { id: 'emoji', label: 'Emoji' },
      { id: 'gif', label: 'GIFs' },
      { id: 'sticker', label: 'Stickers' }
    ]

    return (
      <div
        class="channel-chat-reaction-popover"
        role="dialog"
        aria-label="Choose a reaction"
        style={`top: ${pickerPosition.top}px; left: ${pickerPosition.left}px`}
      >
        <div class="channel-chat-reaction-popover-header">
          <strong>React</strong>
          <button type="button" class="channel-chat-reaction-close" aria-label="Close reactions" onClick={onClose}>×</button>
        </div>
        <div class="channel-chat-reaction-tabs" role="tablist" aria-label="Reaction types">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab.value === tab.id}
              class={activeTab.value === tab.id ? 'is-active' : ''}
              onClick={() => activeTab.value = tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          class="channel-chat-reaction-search"
          type="search"
          placeholder={activeTab.value === 'emoji' ? 'Search emoji' : `Search ${activeTab.value === 'gif' ? 'GIFs' : 'stickers'}`}
          aria-label={`Search ${activeTab.value}`}
          use:bind={search}
        />
        {activeTab.value === 'emoji' && (
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
        )}
        {activeTab.value === 'gif' && (
          <div class="channel-chat-gif-grid">
            {gifOptions.map(gif => (
              <button key={gif.url} class="channel-chat-gif-option" type="button" aria-label={`Use ${gif.label} GIF`} onClick={() => choose('gif', gif.url, gif.label)}>
                <img src={gif.url} alt={gif.label} loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {activeTab.value === 'sticker' && (
          <div class="channel-chat-sticker-grid">
            {stickerOptions.map(sticker => (
              <button key={sticker.label} class="channel-chat-sticker-option" type="button" aria-label={`Use ${sticker.label} sticker`} onClick={() => choose('sticker', sticker.value, sticker.label)}>
                <span aria-hidden="true">{sticker.value}</span>
                <small>{sticker.label}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  })

  return picker
}

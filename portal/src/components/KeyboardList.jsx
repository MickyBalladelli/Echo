export function KeyboardList({ children, label, className = '' }) {
  function moveFocus(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return

    const current = event.target.closest('[data-keyboard-item]')
    if (!current || !event.currentTarget.contains(current)) return

    const items = [...event.currentTarget.querySelectorAll('[data-keyboard-item]')]
    const index = items.indexOf(current)
    if (index < 0) return

    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))

    event.preventDefault()
    items[nextIndex]?.focus()
  }

  return (
    <div class={className} role="region" aria-label={label} onKeyDown={moveFocus}>
      {children}
    </div>
  )
}

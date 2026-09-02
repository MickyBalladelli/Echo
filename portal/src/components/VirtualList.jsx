import { computed, signal } from '../lib/vendor.js'

const defaultViewportHeight = 640

export function VirtualList({
  items,
  renderItem,
  itemKey = item => item.id,
  estimateSize = 320,
  threshold = 30,
  label = 'List',
  onScroll
}) {
  const scrollTop = signal(0)
  const viewportHeight = signal(defaultViewportHeight)
  const readItems = () => Array.isArray(items) ? items : items.value || []

  function updateScroll(event) {
    const element = event.currentTarget
    scrollTop.value = element.scrollTop
    viewportHeight.value = element.clientHeight || defaultViewportHeight
  }

  function handleScroll(event) {
    updateScroll(event)
    onScroll?.(event)
  }

  const range = computed(() => {
    const values = readItems()
    if (values.length <= threshold) {
      return { start: 0, end: values.length, before: 0, after: 0 }
    }

    const overscan = 4
    const start = Math.max(0, Math.floor(scrollTop.value / estimateSize) - overscan)
    const visibleCount = Math.ceil(viewportHeight.value / estimateSize) + overscan * 2
    const end = Math.min(values.length, start + visibleCount)

    return {
      start,
      end,
      before: start * estimateSize,
      after: Math.max(0, (values.length - end) * estimateSize)
    }
  })

  const renderedItems = computed(() => {
    const values = readItems()
    const currentRange = range.value
    const visible = values.slice(currentRange.start, currentRange.end)

    return (
      <>
        {currentRange.before > 0 && <div class="virtual-list-spacer" style={`height: ${currentRange.before}px`} aria-hidden="true" />}
        {visible.map((item, index) => (
          <div
            key={itemKey(item, currentRange.start + index)}
            class="virtual-list-item"
            style={values.length > threshold ? `min-height: ${estimateSize}px` : undefined}
          >
            {renderItem(item, currentRange.start + index)}
          </div>
        ))}
        {currentRange.after > 0 && <div class="virtual-list-spacer" style={`height: ${currentRange.after}px`} aria-hidden="true" />}
      </>
    )
  })

  return (
    <div class="virtual-list" role="region" aria-label={label} onScroll={handleScroll}>
      {renderedItems}
    </div>
  )
}

let tooltipId = 0

function titleTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement
  const anchor = element?.closest('[title], [data-echo-tooltip]')
  if (!anchor || anchor.closest('.prism-tooltip-anchor')) return null
  return anchor
}

function prepareTitle(anchor) {
  if (!(anchor instanceof Element)) return
  const title = anchor.getAttribute('title')
  if (!title) return
  anchor.dataset.echoTooltip = title
  anchor.removeAttribute('title')
}

function prepareTitles(root) {
  if (!(root instanceof Element)) return
  prepareTitle(root)
  root.querySelectorAll('[title]').forEach(prepareTitle)
}

function tooltipText(anchor) {
  prepareTitle(anchor)
  return anchor.dataset.echoTooltip || ''
}

function containsNode(anchor, target) {
  return anchor instanceof Element && target instanceof Node && anchor.contains(target)
}

function positionTooltip(tooltip, anchor) {
  const gap = 8
  const anchorRect = anchor.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()
  const maxLeft = Math.max(gap, window.innerWidth - tooltipRect.width - gap)
  const centeredLeft = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2
  const left = Math.min(maxLeft, Math.max(gap, centeredLeft))
  const aboveTop = anchorRect.top - tooltipRect.height - gap
  const top = aboveTop >= gap ? aboveTop : anchorRect.bottom + gap
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${Math.max(gap, top)}px`
}

export function installImmediateTitleTooltips() {
  if (typeof document === 'undefined' || !document.body) return () => {}

  const tooltip = document.createElement('span')
  tooltip.id = `echo-immediate-tooltip-${++tooltipId}`
  tooltip.className = 'echo-immediate-tooltip'
  tooltip.setAttribute('role', 'tooltip')
  tooltip.hidden = true
  document.body.append(tooltip)

  let activeAnchor = null

  const hide = () => {
    activeAnchor = null
    tooltip.hidden = true
    tooltip.setAttribute('aria-hidden', 'true')
  }

  prepareTitles(document.body)
  const titleObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') prepareTitle(record.target)
      if (record.type === 'childList') record.addedNodes.forEach(prepareTitles)
    }
  })
  titleObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })

  const show = anchor => {
    const content = tooltipText(anchor)
    if (!content) return
    activeAnchor = anchor
    tooltip.textContent = content
    tooltip.hidden = false
    tooltip.setAttribute('aria-hidden', 'false')
    positionTooltip(tooltip, anchor)
  }

  const handlePointerOver = event => {
    const anchor = titleTarget(event.target)
    if (!anchor) {
      if (activeAnchor) hide()
      return
    }
    if (containsNode(anchor, event.relatedTarget)) return
    show(anchor)
  }

  const handlePointerOut = event => {
    const anchor = titleTarget(event.target)
    if (!anchor || anchor !== activeAnchor) return
    if (containsNode(anchor, event.relatedTarget)) return
    hide()
  }

  const handleFocusIn = event => {
    const anchor = titleTarget(event.target)
    if (anchor) show(anchor)
    else if (activeAnchor) hide()
  }

  const handleFocusOut = event => {
    const anchor = titleTarget(event.target)
    if (!anchor || anchor !== activeAnchor) return
    if (containsNode(anchor, event.relatedTarget)) return
    hide()
  }

  const handleViewportChange = () => {
    if (activeAnchor && !tooltip.hidden) positionTooltip(tooltip, activeAnchor)
  }

  document.addEventListener('pointerover', handlePointerOver)
  document.addEventListener('pointerout', handlePointerOut)
  document.addEventListener('focusin', handleFocusIn)
  document.addEventListener('focusout', handleFocusOut)
  window.addEventListener('blur', hide)
  window.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('resize', handleViewportChange)

  return () => {
    hide()
    document.removeEventListener('pointerover', handlePointerOver)
    document.removeEventListener('pointerout', handlePointerOut)
    document.removeEventListener('focusin', handleFocusIn)
    document.removeEventListener('focusout', handleFocusOut)
    window.removeEventListener('blur', hide)
    window.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('resize', handleViewportChange)
    titleObserver.disconnect()
    tooltip.remove()
  }
}

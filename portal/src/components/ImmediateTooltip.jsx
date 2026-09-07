import { Tooltip } from '../lib/vendor.js'

export function ImmediateTooltip(props = {}) {
  return Tooltip({ ...props, delay: 0, showDelay: 0 })
}

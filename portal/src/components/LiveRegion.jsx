export function LiveRegion({ message, assertive = false }) {
  return (
    <span
      class="sr-only"
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {message}
    </span>
  )
}

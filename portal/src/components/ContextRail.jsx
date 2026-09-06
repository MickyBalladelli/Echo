import { PostOverview } from './PostOverview.jsx'

export function ContextRail({ router }) {
  return (
    <aside class="context-rail" aria-label="Echo context panel">
      <PostOverview router={router} />
    </aside>
  )
}

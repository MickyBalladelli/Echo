import { Button, Card, EmptyState, Label } from '../lib/vendor.js'

export function PageFrame({ eyebrow, title, description, headerActions, hideHeader = false, children }) {
  return (
    <section class="route-page" aria-labelledby="route-title">
      {!hideHeader && (
        <header class="route-page-header">
          <div>
            <Label size="small" tone="accent">{eyebrow}</Label>
            <h1 id="route-title">{title}</h1>
            <p class="route-description">{description}</p>
          </div>
          {headerActions && <div class="route-page-actions">{headerActions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function ComingSoon({ title, description }) {
  return (
    <Card class="route-card">
      <EmptyState
        title={title}
        description={description}
        action={Button({ children: 'Feature queued', variant: 'secondary', disabled: true })}
      />
    </Card>
  )
}

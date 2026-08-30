import { Button, Card, EmptyState, Label } from '../lib/vendor.js'

export function PageFrame({ eyebrow, title, description, children }) {
  return (
    <section class="route-page" aria-labelledby="route-title">
      <Label size="small" tone="accent">{eyebrow}</Label>
      <h1 id="route-title">{title}</h1>
      <p class="route-description">{description}</p>
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

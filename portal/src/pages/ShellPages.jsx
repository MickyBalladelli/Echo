import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { ProfileCard } from '../components/ProfileCard.jsx'

function PageFrame({ eyebrow, title, description, children }) {
  return (
    <section class="route-page" aria-labelledby="route-title">
      <Label size="small" tone="accent">{eyebrow}</Label>
      <h1 id="route-title">{title}</h1>
      <p class="route-description">{description}</p>
      {children}
    </section>
  )
}

function ComingSoon({ title, description }) {
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

export function HomePage() {
  return (
    <PageFrame
      eyebrow="HOME / FEED"
      title="Home"
      description="Your feed will live here. Follow people and watch the conversation grow."
    >
      <ComingSoon title="Your feed is quiet" description="Your newest posts will appear here once posting is connected." />
    </PageFrame>
  )
}

export function ExplorePage() {
  return (
    <PageFrame
      eyebrow="DISCOVER / EXPLORE"
      title="Explore"
      description="Find people, posts, and channels worth your attention."
    >
      <ComingSoon title="Nothing trending yet" description="Explore will show search, popular posts, and new voices." />
    </PageFrame>
  )
}

export function NotificationsPage() {
  return (
    <PageFrame
      eyebrow="INBOX / NOTIFICATIONS"
      title="Notifications"
      description="Replies, likes, follows, and channel activity will land here."
    >
      <ComingSoon title="All quiet" description="You have no notifications yet." />
    </PageFrame>
  )
}

export function NotesPage() {
  return (
    <PageFrame
      eyebrow="PRIVATE / NOTES"
      title="Notes"
      description="Keep private thoughts close, then turn the good ones into posts."
    >
      <ComingSoon title="No notes yet" description="Your notes list and editor will appear here." />
    </PageFrame>
  )
}

export function ChannelsPage() {
  return (
    <PageFrame
      eyebrow="COMMUNITIES / CHANNELS"
      title="Channels"
      description="Browse focused spaces and join the conversations that fit."
    >
      <ComingSoon title="No channels yet" description="Public channel discovery and membership are next." />
    </PageFrame>
  )
}

export function ChatPage() {
  return (
    <PageFrame
      eyebrow="DIRECT / CHAT"
      title="Chat"
      description="Private conversations and real-time messages will live here."
    >
      <ComingSoon title="No conversations yet" description="Start a conversation when chat persistence is connected." />
    </PageFrame>
  )
}

export function ProfilePage({ userState, onLogout, onUpdated }) {
  return (
    <PageFrame
      eyebrow="YOU / PROFILE"
      title="Profile"
      description="Your public identity, bio, and account details."
    >
      <ProfileCard user={userState.value} onLogout={onLogout} onUpdated={onUpdated} />
    </PageFrame>
  )
}

export function NotFoundPage({ router }) {
  return (
    <PageFrame
      eyebrow="ECHO / 404"
      title="Page not found"
      description="This route does not exist."
    >
      <Card class="route-card">
        <EmptyState
          status="error"
          title="Lost signal"
          description="Go back home and try a known route."
          action={Button({ children: 'Go home', onClick: () => router.navigate('/') })}
        />
      </Card>
    </PageFrame>
  )
}

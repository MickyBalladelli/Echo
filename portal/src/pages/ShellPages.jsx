import { ProfileCard } from '../components/ProfileCard.jsx'
import { UserSocialContent } from '../components/UserSocialContent.jsx'
import { Card, EmptyState, Button } from '../lib/vendor.js'
import { ComingSoon, PageFrame } from './PageFrame.jsx'
import { FeedPage, PostDetailPage } from './FeedPage.jsx'

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

export function ProfilePage({ userState, onLogout, onUpdated, router }) {
  return (
    <PageFrame
      eyebrow="YOU / PROFILE"
      title="Profile"
      description="Your public identity, bio, and account details."
    >
      <ProfileCard user={userState.value} onLogout={onLogout} onUpdated={onUpdated} />
      <UserSocialContent
        username={userState.value.username}
        router={router}
        currentUserId={userState.value.id}
        showIdentity={false}
      />
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

export { FeedPage as HomePage, PostDetailPage }

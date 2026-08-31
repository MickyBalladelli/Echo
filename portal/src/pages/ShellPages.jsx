import { ProfileCard } from '../components/ProfileCard.jsx'
import { UserSocialContent } from '../components/UserSocialContent.jsx'
import { ExploreContent } from '../components/ExploreContent.jsx'
import { NotificationCenter } from '../components/NotificationCenter.jsx'
import { NotificationPreferences } from '../components/NotificationPreferences.jsx'
import { ChannelDirectory } from '../components/ChannelDirectory.jsx'
import { NotesWorkspace } from '../components/NotesWorkspace.jsx'
import { ChatWorkspace } from '../components/ChatWorkspace.jsx'
import { AdvancedSettings } from '../components/AdvancedSettings.jsx'
import { Card, EmptyState, Button } from '../lib/vendor.js'
import { ComingSoon, PageFrame } from './PageFrame.jsx'
import { FeedPage, PostDetailPage } from './FeedPage.jsx'

export function ExplorePage({ router, currentUserId }) {
  return (
    <PageFrame
      eyebrow="DISCOVER / EXPLORE"
      title="Explore"
      description="Find people, topics, and public posts for your timeline."
    >
      <ExploreContent router={router} currentUserId={currentUserId} />
    </PageFrame>
  )
}

export function NotificationsPage({ router, unreadCount, notificationVersion }) {
  return (
    <PageFrame
      eyebrow="INBOX / NOTIFICATIONS"
      title="Notifications"
      description="Replies, likes, follows, and channel activity will land here."
    >
      <NotificationCenter router={router} unreadCount={unreadCount} notificationVersion={notificationVersion} />
    </PageFrame>
  )
}

export function PreferencesPage({ user, onDeleted }) {
  return (
    <PageFrame
      eyebrow="YOU / PREFERENCES"
      title="Preferences"
      description="Choose which signals reach your inbox, browser, and future email digest."
    >
      <NotificationPreferences />
      <AdvancedSettings user={user} onDeleted={onDeleted} />
    </PageFrame>
  )
}

export function NotesPage({ router, noteId = null }) {
  return (
    <PageFrame
      eyebrow="PRIVATE / NOTES"
      title="Notes"
      description="Keep private thoughts close, then turn the good ones into posts."
    >
      <NotesWorkspace router={router} noteId={noteId} />
    </PageFrame>
  )
}

export function ChannelsPage({ router }) {
  return (
    <PageFrame
      eyebrow="COMMUNITIES / CHANNELS"
      title="Channels"
      description="Chat rooms for focused conversations."
    >
      <ChannelDirectory router={router} />
    </PageFrame>
  )
}

export function ChatPage({ router, conversationId = null, currentUserId }) {
  return (
    <PageFrame
      eyebrow="DIRECT / CHAT"
      title="Chat"
      description="Private conversations and real-time messages will live here."
    >
      <ChatWorkspace router={router} conversationId={conversationId} currentUserId={currentUserId} />
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

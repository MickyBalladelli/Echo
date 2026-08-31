import { createRouter, html, onMount, routerView } from '../lib/vendor.js'
import { Badge, Footer, Header, Label, Layout } from '../lib/vendor.js'
import { ContextRail } from './ContextRail.jsx'
import { ShellNavigation } from './ShellNavigation.jsx'
import { UserProfilePage } from '../pages/UserProfilePage.jsx'
import { ChannelDetailPage } from '../pages/ChannelDetailPage.jsx'
import { BookmarksPage } from '../pages/BookmarksPage.jsx'
import { HashtagPage } from '../pages/HashtagPage.jsx'
import {
  ChannelsPage,
  ChatPage,
  ExplorePage,
  HomePage,
  NotFoundPage,
  NotificationsPage,
  NotesPage,
  PostDetailPage,
  PreferencesPage,
  ProfilePage
} from '../pages/ShellPages.jsx'

export function AppShell({
  userState,
  apiStatus,
  socketStatus,
  unreadNotifications,
  notificationVersion,
  onLogout,
  onUpdated
}) {
  const router = createRouter([
    { path: '/', title: 'Home', view: () => HomePage({ router, currentUserId: userState.value.id }) },
    {
      path: '/following',
      title: 'Following',
      view: () => HomePage({ router, currentUserId: userState.value.id, feed: 'following' })
    },
    {
      path: '/explore',
      title: 'Explore',
      view: () => ExplorePage({ router, currentUserId: userState.value.id })
    },
    {
      path: '/notifications',
      title: 'Notifications',
      view: () => NotificationsPage({
        router,
        unreadCount: unreadNotifications,
        notificationVersion
      })
    },
    {
      path: '/bookmarks',
      title: 'Bookmarks',
      view: () => BookmarksPage({ router, currentUserId: userState.value.id })
    },
    { path: '/notes', title: 'Notes', view: () => NotesPage({ router }) },
    {
      path: '/notes/:id',
      title: 'Note',
      view: ({ id }) => NotesPage({ router, noteId: id })
    },
    { path: '/channels', title: 'Channels', view: () => ChannelsPage({ router }) },
    {
      path: '/channels/:slug',
      title: 'Channel',
      view: ({ slug }) => ChannelDetailPage({ slug, router, currentUserId: userState.value.id })
    },
    { path: '/chat', title: 'Chat', view: () => ChatPage({ router, currentUserId: userState.value.id }) },
    {
      path: '/chat/:id',
      title: 'Chat',
      view: ({ id }) => ChatPage({ router, conversationId: id, currentUserId: userState.value.id })
    },
    {
      path: '/profile',
      title: 'Profile',
      view: () => ProfilePage({ userState, onLogout, onUpdated, router })
    },
    { path: '/preferences', title: 'Preferences', view: () => PreferencesPage() },
    {
      path: '/users/:username',
      title: 'Profile',
      view: ({ username }) => UserProfilePage({ username, router, currentUserId: userState.value.id })
    },
    {
      path: '/posts/:id',
      title: 'Post',
      view: ({ id }) => PostDetailPage({ id, router, currentUserId: userState.value.id })
    },
    {
      path: '/hashtags/:tag',
      title: 'Hashtag',
      view: ({ tag }) => HashtagPage({ tag, router, currentUserId: userState.value.id })
    },
    {
      path: '*path',
      title: 'Not found',
      view: () => NotFoundPage({ router })
    }
  ], {
    afterEach: ({ route }) => {
      document.title = `${route?.title || 'Echo'} · Echo`
    }
  })
  const activeView = routerView(router, () => NotFoundPage({ router }))
  const user = userState.value

  onMount(() => router.start())

  return (
    <div class="echo-shell">
      <a class="skip-link" href="#main-content">Skip to content</a>
      <Layout
        class="echo-layout"
        header={Header({
          class: 'echo-header',
          sticky: false,
          ariaLabel: 'Echo header',
          children: html`<div class="echo-header-content"><Label size="large">Echo</Label><span>Small signals. Real people.</span></div>`,
          trailing: Badge({ children: 'SIGNED IN', tone: 'success' })
        })}
        navigator={ShellNavigation({ router, user, unreadNotifications })}
        footer={Footer({
          leading: 'Echo',
          trailing: html`<span>Built for conversation</span>`
        })}
      >
        <div class="app-content-grid">
          <main id="main-content" class="app-main" tabindex="-1">
            {activeView}
          </main>
          <ContextRail user={user} apiStatus={apiStatus} socketStatus={socketStatus} />
        </div>
      </Layout>
    </div>
  )
}

import { computed, createRouter, onMount, routerView, signal } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import echoIconUrl from '../assets/icons/echo.png'
import { ArrowLeftIcon, Badge, Header, IconButton, Label, Layout } from '../lib/vendor.js'
import { ContextRail } from './ContextRail.jsx'
import { ShellNavigation } from './ShellNavigation.jsx'
import { UserProfilePage } from '../pages/UserProfilePage.jsx'
import { ChannelDetailPage } from '../pages/ChannelDetailPage.jsx'
import { BookmarksPage } from '../pages/BookmarksPage.jsx'
import { HashtagPage } from '../pages/HashtagPage.jsx'
import { ModerationPage } from '../pages/ModerationPage.jsx'
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
  const channelHeader = signal(null)
  const router = createRouter([
    { path: '/', title: 'Timeline', view: () => HomePage({ router, currentUserId: userState.value.id }) },
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
      view: ({ slug }) => {
        channelHeader.value = null
        return ChannelDetailPage({
          slug,
          router,
          currentUserId: userState.value.id,
          onHeaderChange: value => channelHeader.value = value
        })
      }
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
    { path: '/preferences', title: 'Preferences', view: () => PreferencesPage({ user: userState.value, onDeleted: onLogout }) },
    { path: '/moderation', title: 'Moderation', view: () => ModerationPage({ user: userState.value }) },
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
      apiRequest('/api/me/analytics/events', {
        method: 'POST',
        body: JSON.stringify({ eventName: 'page_view', properties: { path: route?.path || '/' } })
      }).catch(() => {})
    }
  })
  const activeView = routerView(router, () => NotFoundPage({ router }))
  const layoutClass = computed(() => router.path.value.startsWith('/channels/') ? 'echo-layout echo-layout-channel' : 'echo-layout')
  const globalHeader = computed(() => {
    const channel = channelHeader.value
    if (!channel || !router.path.value.startsWith('/channels/')) {
      return (
        <div class="echo-header-content">
          <div class="echo-header-brand">
            <img class="echo-header-icon" src={echoIconUrl} alt="" aria-hidden="true" />
            <div class="echo-header-copy"><Label size="large">ECHO</Label><span>Small signals. Real people.</span></div>
          </div>
        </div>
      )
    }

    return (
      <div class="echo-header-content echo-channel-header-content">
        <div class="echo-header-brand">
          <img class="echo-header-icon" src={echoIconUrl} alt="" aria-hidden="true" />
          <div class="echo-header-copy"><Label size="large">ECHO</Label><span>Small signals. Real people.</span></div>
        </div>
        <div class="echo-channel-header-details">
          <div class="echo-channel-primary">
            <IconButton
              class="echo-channel-back-button"
              icon={ArrowLeftIcon()}
              size="small"
              ariaLabel="All channels"
              title="All channels"
              onClick={router.link('/channels')}
            />
            <div class="echo-channel-identity">
              <h1><a class="echo-channel-title-link" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}>{channel.name}</a></h1>
              <a class="echo-channel-slug-link" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}>/{channel.slug}</a>
            </div>
            <p class="echo-channel-visibility">{channel.visibility === 'private' ? 'Private chat room · invite only.' : 'Public chat room · anyone can join.'}</p>
          </div>
        </div>
      </div>
    )
  })
  const user = userState.value

  onMount(() => router.start())

  return (
    <div class="echo-shell">
      <a class="skip-link" href="#main-content">Skip to content</a>
      <Layout
        class={layoutClass}
        header={Header({
          class: 'echo-header',
          sticky: true,
          ariaLabel: 'Echo header',
          children: globalHeader,
          trailing: Badge({ children: 'SIGNED IN', tone: 'success' })
        })}
        navigator={ShellNavigation({ router, user, unreadNotifications })}
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

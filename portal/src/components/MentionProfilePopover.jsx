import { computed, signal } from '../lib/vendor.js'
import { Badge } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { UserAvatar } from './UserAvatar.jsx'
import { UserBadges } from './UserBadges.jsx'

function displayName(user, username) {
  return user?.profile?.displayName || user?.displayName || username
}

function bio(user) {
  return user?.profile?.bio || user?.bio || ''
}

export function MentionProfilePopover({ username, previewUser = null, router, children }) {
  const open = signal(false)
  const loading = signal(false)
  const profile = signal(previewUser)
  const error = signal('')
  let closeTimer

  function cancelClose() {
    clearTimeout(closeTimer)
  }

  function hide() {
    cancelClose()
    closeTimer = setTimeout(() => open.value = false, 140)
  }

  async function show() {
    cancelClose()
    open.value = true
    if (profile.value || loading.value) return

    loading.value = true
    error.value = ''
    try {
      const result = await apiRequest(`/api/users/${encodeURIComponent(username)}`)
      profile.value = result.data.user
    } catch (requestError) {
      error.value = requestError.message || 'Could not load profile'
    } finally {
      loading.value = false
    }
  }

  const profilePath = `/users/${encodeURIComponent(username)}`
  const returnPath = router?.path?.value?.startsWith('/channels/') ? router.path.value : ''
  const profileHref = returnPath
    ? `${profilePath}?from=${encodeURIComponent(returnPath)}`
    : profilePath
  const popover = computed(() => {
    if (!open.value) return null

    return (
      <div
        class="channel-chat-profile-popover"
        role="dialog"
        aria-label={`Profile for ${username}`}
        onMouseEnter={cancelClose}
        onMouseLeave={hide}
      >
        {profile.value
          ? <>
            <div class="channel-chat-profile-heading">
              <UserAvatar user={profile.value} size="small" className="channel-chat-profile-avatar" />
              <div>
                <strong>{displayName(profile.value, username)}</strong>
                <span>@{profile.value.username || username}</span>
              </div>
            </div>
            <UserBadges badges={profile.value.profile?.badges || []} />
            {previewUser?.role === 'moderator' && <Badge tone="success" size="small">Moderator</Badge>}
            {previewUser?.role === 'owner' && <Badge tone="accent" size="small">Owner</Badge>}
            <p>{bio(profile.value) || 'No bio yet.'}</p>
            <a class="channel-chat-profile-link" href={profileHref} onClick={router?.link(profileHref)}>View profile</a>
          </>
          : loading.value
            ? <span role="status">Loading profile…</span>
            : <span role="status">{error.value || 'Profile unavailable'}</span>}
      </div>
    )
  })

  return (
    <span class="channel-chat-mention-anchor" onMouseEnter={show} onMouseLeave={hide}>
      <a
        class="channel-chat-mention"
        href={profileHref}
        onClick={router?.link(profileHref)}
        onFocus={show}
        onBlur={hide}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {children}
      </a>
      {popover}
    </span>
  )
}

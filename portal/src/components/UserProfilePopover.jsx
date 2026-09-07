import { computed, signal } from '../lib/vendor.js'
import { Badge } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { UserAvatar } from './UserAvatar.jsx'
import { UserBadges } from './UserBadges.jsx'

let profilePopoverId = 0

function displayName(user, username) {
  return user?.profile?.displayName || user?.displayName || username
}

function bio(user) {
  return user?.profile?.bio || user?.bio || ''
}

export function UserProfilePopover({ username, previewUser = null, router, children, embedded = false, wrapperClassName = '', wrapperProps = {}, triggerClassName = '', triggerProps = {} }) {
  const open = signal(false)
  const loading = signal(false)
  const profile = signal(previewUser)
  const error = signal('')
  const popupPosition = signal({ top: 8, left: 8 })
  const instanceId = `user-profile-popover-${++profilePopoverId}`
  let closeTimer

  function cancelClose() {
    clearTimeout(closeTimer)
  }

  function hide() {
    cancelClose()
    closeTimer = setTimeout(() => {
      open.value = false
      popupPosition.value = { top: 8, left: 8 }
    }, 140)
  }

  function positionPopup(target, popup = null) {
    if (!target || typeof window === 'undefined') return
    const rect = target.getBoundingClientRect()
    const gap = 10
    const popupRect = popup?.getBoundingClientRect()
    const popupWidth = popupRect?.width || Math.min(240, window.innerWidth - 16)
    const popupHeight = popupRect?.height || 190
    const left = Math.min(window.innerWidth - popupWidth - 8, Math.max(8, rect.left))
    const aboveTop = rect.top - popupHeight - gap
    const top = aboveTop >= 8
      ? aboveTop
      : Math.min(window.innerHeight - popupHeight - 8, rect.bottom + gap)
    popupPosition.value = { top: Math.max(8, top), left }
  }

  async function show(event) {
    cancelClose()
    const target = event?.currentTarget
    positionPopup(target)
    open.value = true
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const popup = [...document.querySelectorAll('.user-profile-popover')]
          .find(element => element.dataset.profilePopoverId === instanceId)
        positionPopup(target, popup)
      })
    }
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
  const wrapperClass = `user-profile-popover-anchor ${wrapperClassName}`.trim()
  const triggerClass = `user-profile-trigger ${triggerClassName}`.trim()
  const popoverStyle = computed(() => `top: ${popupPosition.value.top}px; left: ${popupPosition.value.left}px`)
  function goToProfile(event) {
    event.preventDefault()
    event.stopPropagation()
    router?.navigate(profileHref)
  }

  function handleTriggerKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    goToProfile(event)
  }

  const popover = computed(() => {
    if (!open.value) return null

    return (
      <div
        class="user-profile-popover"
        data-profile-popover-id={instanceId}
        style={popoverStyle}
        role="dialog"
        aria-label={`Profile for ${username}`}
        onMouseEnter={cancelClose}
        onMouseLeave={hide}
      >
        {profile.value
          ? <>
            <div class="user-profile-popover-heading">
              <UserAvatar user={profile.value} size="small" className="user-profile-popover-avatar" />
              <div>
                <strong>{displayName(profile.value, username)}</strong>
                <span>@{profile.value.username || username}</span>
              </div>
            </div>
            <UserBadges badges={profile.value.profile?.badges || profile.value.badges || []} />
            {previewUser?.role === 'moderator' && <Badge tone="success" size="small">Moderator</Badge>}
            {previewUser?.role === 'owner' && <Badge tone="accent" size="small">Owner</Badge>}
            <p>{bio(profile.value) || 'No bio yet.'}</p>
            {embedded
              ? <span class="user-profile-popover-link" role="link" tabIndex={0} onClick={goToProfile} onKeyDown={handleTriggerKeyDown}>View profile</span>
              : <a class="user-profile-popover-link" href={profileHref} onClick={router?.link(profileHref)}>View profile</a>}
          </>
          : loading.value
            ? <span role="status">Loading profile…</span>
            : <span role="status">{error.value || 'Profile unavailable'}</span>}
      </div>
    )
  })

  return (
    <span {...wrapperProps} class={wrapperClass} onMouseEnter={show} onMouseLeave={hide}>
      {embedded
        ? <span
          {...triggerProps}
          class={triggerClass}
          role="link"
          tabIndex={0}
          onClick={goToProfile}
          onKeyDown={handleTriggerKeyDown}
          onFocus={show}
          onBlur={hide}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {children}
        </span>
        : <a
          {...triggerProps}
          class={triggerClass}
          href={profileHref}
          onClick={router?.link(profileHref)}
          onFocus={show}
          onBlur={hide}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {children}
        </a>}
      {popover}
    </span>
  )
}

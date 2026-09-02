import { Card } from '../lib/vendor.js'
import { formatMonthYear } from '../lib/dates.js'
import { mediaSrc } from '../lib/media.js'
import { UserAvatar } from './UserAvatar.jsx'
import { UserBadges } from './UserBadges.jsx'

function profileBadges(user) {
  return user.badges || user.profile?.badges || []
}

export function ProfileHero({ user, actions = null }) {
  const profile = user.profile || {}
  const displayName = profile.displayName || user.username
  const statsVisible = !user.isPrivate && (typeof user.followerCount === 'number' || typeof user.followingCount === 'number')

  return (
    <Card class="profile-hero">
      <div class="profile-hero-banner">
        {profile.bannerUrl
          ? <img src={mediaSrc(profile.bannerUrl)} alt="" loading="lazy" decoding="async" />
          : <div class="profile-hero-banner-fallback" aria-hidden="true" />}
      </div>
      <div class="profile-hero-main">
        <div class="profile-hero-action-row">
          <div class="profile-hero-avatar-wrap">
            <UserAvatar user={user} size="large" className="profile-hero-avatar" />
          </div>
          {actions && <div class="profile-hero-actions">{actions}</div>}
        </div>
        <div class="profile-hero-copy">
          <div class="profile-hero-name-row">
            <h2>{displayName}</h2>
            <UserBadges badges={profileBadges(user)} compact />
          </div>
          <span class="profile-hero-handle">@{user.username}</span>
          <p class="profile-hero-bio">{profile.bio || 'No bio yet.'}</p>
          <div class="profile-hero-meta">
            <span><span aria-hidden="true">▣</span> Joined {formatMonthYear(user.createdAt)}</span>
          </div>
          {statsVisible && (
            <div class="profile-hero-stats" aria-label="Follow counts">
              {typeof user.followingCount === 'number' && <span><strong>{user.followingCount}</strong> following</span>}
              {typeof user.followerCount === 'number' && <span><strong>{user.followerCount}</strong> followers</span>}
              {user.mutualFollowerCount > 0 && <span><strong>{user.mutualFollowerCount}</strong> mutual follows</span>}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

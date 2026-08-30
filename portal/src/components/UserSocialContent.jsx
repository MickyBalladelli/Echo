import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { FollowButton } from './FollowButton.jsx'
import { PostCard } from './PostCard.jsx'
import { UserList } from './UserList.jsx'

function formatJoinDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function initial(user) {
  return (user.profile.displayName || user.username).slice(0, 1).toUpperCase()
}

export function UserSocialContent({ username, router, currentUserId, showIdentity = true }) {
  const user = signal(null)
  const followers = signal([])
  const following = signal([])
  const posts = signal([])
  const state = signal('loading')
  const error = signal('')

  async function loadAll() {
    state.value = 'loading'
    error.value = ''

    try {
      const encodedUsername = encodeURIComponent(username)
      const [profileResult, followersResult, followingResult, postsResult] = await Promise.all([
        apiRequest(`/api/users/${encodedUsername}`),
        apiRequest(`/api/users/${encodedUsername}/followers?limit=50`),
        apiRequest(`/api/users/${encodedUsername}/following?limit=50`),
        apiRequest(`/api/users/${encodedUsername}/posts?limit=50`)
      ])
      user.value = profileResult.data.user
      followers.value = followersResult.data
      following.value = followingResult.data
      posts.value = postsResult.data
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load profile'
      state.value = 'error'
    }
  }

  function removePost(postId) {
    posts.value = posts.value.filter(post => post.id !== postId)
  }

  const content = computed(() => {
    if (state.value === 'loading') {
      return <Card class="route-card feed-status-card"><div role="status">Loading profile…</div></Card>
    }

    if (state.value === 'error') {
      return (
        <Card class="route-card feed-status-card">
          <EmptyState
            status="error"
            title="Profile unavailable"
            description={error.value}
            action={Button({ children: 'Try again', onClick: loadAll })}
          />
        </Card>
      )
    }

    return (
      <div class="user-social-stack">
        {showIdentity && (
          <Card class="public-profile-card">
            <div class="profile-avatar" aria-hidden="true">{initial(user.value)}</div>
            <div class="profile-copy">
              <Label size="large">{user.value.profile.displayName}</Label>
              <span class="profile-handle">@{user.value.username}</span>
              <p>{user.value.profile.bio || 'No bio yet.'}</p>
              <span class="profile-joined">Joined {formatJoinDate(user.value.createdAt)}</span>
            </div>
            {!user.value.isSelf && (
              <FollowButton
                userId={user.value.id}
                following={user.value.followedByViewer}
                onChanged={follow => {
                  user.value = {
                    ...user.value,
                    followedByViewer: follow.following,
                    followerCount: follow.followerCount
                  }
                  loadAll()
                }}
              />
            )}
          </Card>
        )}
        <div class="social-counts" aria-label="Follow counts">
          <span><strong>{user.value.followerCount}</strong> followers</span>
          <span><strong>{user.value.followingCount}</strong> following</span>
        </div>
        <div class="social-lists-grid">
          <UserList title="Followers" users={followers.value} router={router} />
          <UserList title="Following" users={following.value} router={router} />
        </div>
        <div class="post-replies-heading">
          <Label size="small" tone="accent">POSTS</Label>
          <span>{posts.value.length ? `${posts.value.length} recent` : 'No posts yet'}</span>
        </div>
        {posts.value.length > 0 && (
          <div class="post-feed">
            {posts.value.map(post => (
              <PostCard
                key={post.id}
                post={post}
                router={router}
                currentUserId={currentUserId}
                onDeleted={removePost}
              />
            ))}
          </div>
        )}
      </div>
    )
  })

  onMount(loadAll)

  return content
}

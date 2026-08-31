import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { FollowButton } from './FollowButton.jsx'
import { ProfileRelationshipControls } from './ProfileRelationshipControls.jsx'
import { UserBadges } from './UserBadges.jsx'
import { PostCard } from './PostCard.jsx'
import { UserList } from './UserList.jsx'
import { ReportButton } from './ReportButton.jsx'
import { formatMonthYear } from '../lib/dates.js'
import { KeyboardList } from './KeyboardList.jsx'
import { VirtualList } from './VirtualList.jsx'

function initial(user) {
  return (user.profile.displayName || user.username).slice(0, 1).toUpperCase()
}

function profileAvatar(user) {
  return user.profile.avatarUrl
    ? <img class="profile-avatar" src={user.profile.avatarUrl} alt="" loading="lazy" decoding="async" />
    : <div class="profile-avatar" aria-hidden="true">{initial(user)}</div>
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

  function updatePost(updatedPost) {
    posts.value = posts.value.map(post => post.id === updatedPost.id ? { ...post, ...updatedPost } : post)
    if (user.value?.pinnedPost?.id === updatedPost.id) {
      user.value = { ...user.value, pinnedPost: { ...user.value.pinnedPost, ...updatedPost } }
    }
  }

  async function togglePinned(post) {
    const nextPostId = user.value.pinnedPost?.id === post.id ? null : post.id
    const result = await apiRequest('/api/me/pinned-post', {
      method: 'PATCH',
      body: JSON.stringify({ postId: nextPostId })
    })
    user.value = {
      ...user.value,
      pinnedPostId: result.data.pin.pinnedPostId,
      pinnedPost: nextPostId ? post : null
    }
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
            <div class="public-profile-media">
              {user.value.profile.bannerUrl && <img class="profile-banner" src={user.value.profile.bannerUrl} alt="" loading="lazy" decoding="async" />}
              {profileAvatar(user.value)}
            </div>
            <div class="profile-copy">
              <Label size="large">{user.value.profile.displayName}</Label>
              <UserBadges badges={user.value.badges} />
              <span class="profile-handle">@{user.value.username}</span>
              <p>{user.value.profile.bio || 'No bio yet.'}</p>
              <span class="profile-joined">Joined {formatMonthYear(user.value.createdAt)}</span>
            </div>
            {!user.value.isSelf && <div class="public-profile-actions">
              <FollowButton
                userId={user.value.id}
                following={user.value.followedByViewer}
                followerCount={user.value.followerCount}
                onChanged={follow => {
                  user.value = {
                    ...user.value,
                    followedByViewer: follow.following,
                    followerCount: follow.followerCount ?? user.value.followerCount,
                    isPrivate: user.value.profile.profileVisibility === 'followers' && !follow.following
                  }
                  if (!follow.optimistic) loadAll()
                }}
              />
              <ProfileRelationshipControls
                user={user.value}
                onChanged={relationship => {
                  const isBlocked = relationship.blockedByViewer || relationship.blockedViewer
                  user.value = {
                    ...user.value,
                    ...relationship,
                    isBlocked,
                    isPrivate: isBlocked || (user.value.profile.profileVisibility === 'followers' && !user.value.followedByViewer)
                  }
                }}
              />
              <ReportButton targetType="user" targetId={user.value.id} label="Report profile" />
            </div>}
          </Card>
        )}
        {user.value.isPrivate
          ? <Card class="private-profile-card"><Label size="large">{user.value.isBlocked ? 'This person is blocked' : 'This profile is private'}</Label><p>{user.value.isBlocked ? 'Unblock this person to see their posts and connections.' : 'Follow this person to see their posts and connections.'}</p></Card>
          : <>
            <div class="social-counts" aria-label="Follow counts">
              <span><strong>{user.value.followerCount}</strong> followers</span>
              <span><strong>{user.value.followingCount}</strong> following</span>
              {user.value.mutualFollowerCount > 0 && <span><strong>{user.value.mutualFollowerCount}</strong> mutual follows</span>}
            </div>
        {user.value.pinnedPost && (
          <div class="profile-pinned-post">
            <div class="post-replies-heading"><Label size="small" tone="accent">PINNED POST</Label></div>
            <PostCard
              post={user.value.pinnedPost}
              router={router}
              currentUserId={currentUserId}
              onDeleted={postId => {
                removePost(postId)
                if (user.value.pinnedPost?.id === postId) user.value = { ...user.value, pinnedPost: null, pinnedPostId: null }
              }}
              pinned
              onTogglePinned={user.value.isSelf ? togglePinned : undefined}
              onUpdated={updatePost}
            />
          </div>
        )}
        <div class="social-lists-grid">
          {user.value.profile.showFollowers
            ? <UserList title="Followers" users={followers.value} router={router} />
            : <Card class="social-list-card"><Label size="small" tone="accent">FOLLOWERS</Label><p class="hidden-social-list">This list is hidden.</p></Card>}
          {user.value.profile.showFollowing
            ? <UserList title="Following" users={following.value} router={router} />
            : <Card class="social-list-card"><Label size="small" tone="accent">FOLLOWING</Label><p class="hidden-social-list">This list is hidden.</p></Card>}
        </div>
        <div class="post-replies-heading">
          <Label size="small" tone="accent">POSTS</Label>
          <span>{posts.value.length ? `${posts.value.length} recent` : 'No posts yet'}</span>
        </div>
        {posts.value.length > 0 && (
          <KeyboardList label="User post feed" className="post-feed-keyboard post-feed">
            <VirtualList
              items={posts}
              estimateSize={360}
              label="User post feed"
              renderItem={post => (
                <PostCard
                  post={post}
                  router={router}
                  currentUserId={currentUserId}
                  onDeleted={removePost}
                  onUpdated={updatePost}
                  onReposted={newPost => posts.value = [newPost, ...posts.value.filter(item => item.id !== newPost.id)]}
                />
              )}
            />
          </KeyboardList>
        )}
          </>}
      </div>
    )
  })

  onMount(loadAll)

  return content
}

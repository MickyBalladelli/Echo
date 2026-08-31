import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from '../components/PostCard.jsx'
import { PostComposer } from '../components/PostComposer.jsx'
import { ChannelPostModeration } from '../components/ChannelPostModeration.jsx'
import { PageFrame } from './PageFrame.jsx'
import { joinRealtimeRoom } from '../lib/realtime.js'
import { ReportButton } from '../components/ReportButton.jsx'
import { LiveRegion } from '../components/LiveRegion.jsx'
import { KeyboardList } from '../components/KeyboardList.jsx'
import { VirtualList } from '../components/VirtualList.jsx'

export function ChannelDetailPage({ slug, router, currentUserId }) {
  const channel = signal(null)
  const members = signal([])
  const posts = signal([])
  const state = signal('loading')
  const error = signal('')
  const busy = signal(false)
  const inviteUsername = signal('')
  const name = signal('')
  const description = signal('')
  const imageUrl = signal('')
  const rules = signal('')
  const postApprovalRequired = signal(false)
  const privateChannel = signal(false)
  const announcement = signal('')

  async function load() {
    state.value = 'loading'
    error.value = ''
    try {
      const encodedSlug = encodeURIComponent(slug)
      const [channelResult, membersResult, postsResult] = await Promise.all([
        apiRequest(`/api/channels/${encodedSlug}`),
        apiRequest(`/api/channels/${encodedSlug}/members`),
        apiRequest(`/api/channels/${encodedSlug}/posts?limit=50`)
      ])
      channel.value = channelResult.data.channel
      members.value = membersResult.data
      posts.value = postsResult.data
      name.value = channel.value.name
      description.value = channel.value.description
      imageUrl.value = channel.value.imageUrl || ''
      rules.value = channel.value.rules || ''
      postApprovalRequired.value = channel.value.postApprovalRequired
      privateChannel.value = channel.value.visibility === 'private'
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load channel'
      state.value = 'error'
    }
  }

  async function toggleMembership() {
    if (busy.value || !channel.value) return
    const previous = channel.value
    const joining = !previous.membershipRole
    busy.value = true
    error.value = ''
    channel.value = {
      ...previous,
      membershipRole: joining ? 'member' : null,
      memberCount: Math.max(0, previous.memberCount + (joining ? 1 : -1)),
      invited: joining ? false : previous.invited,
      muted: joining ? false : previous.muted,
      notificationsEnabled: joining ? true : previous.notificationsEnabled
    }
    announcement.value = joining ? 'Joining channel' : 'Leaving channel'
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/membership`, {
        method: joining ? 'PUT' : 'DELETE'
      })
      if (result.data.channel) channel.value = result.data.channel
      announcement.value = joining ? 'Joined channel' : 'Left channel'
    } catch (requestError) {
      channel.value = previous
      announcement.value = 'Channel change failed. Previous state restored.'
      error.value = requestError.message || 'Could not update membership'
    } finally {
      busy.value = false
    }
  }

  async function invite(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      await apiRequest(`/api/channels/${encodeURIComponent(slug)}/invites`, {
        method: 'POST',
        body: JSON.stringify({ username: inviteUsername.value })
      })
      inviteUsername.value = ''
    } catch (requestError) {
      error.value = requestError.message || 'Could not send invite'
    } finally {
      busy.value = false
    }
  }

  async function saveChannel(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.value,
          description: description.value,
          imageUrl: imageUrl.value.trim() || null,
          visibility: privateChannel.value ? 'private' : 'public',
          rules: rules.value,
          postApprovalRequired: postApprovalRequired.value
        })
      })
      channel.value = result.data.channel
    } catch (requestError) {
      error.value = requestError.message || 'Could not save channel'
    } finally {
      busy.value = false
    }
  }

  async function updatePreferences(changes) {
    busy.value = true
    error.value = ''
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/preferences`, {
        method: 'PUT',
        body: JSON.stringify({
          muted: changes.muted ?? channel.value.muted,
          notificationsEnabled: changes.notificationsEnabled ?? channel.value.notificationsEnabled
        })
      })
      channel.value = result.data.channel
    } catch (requestError) {
      error.value = requestError.message || 'Could not update channel preferences'
    } finally {
      busy.value = false
    }
  }

  async function changeRole(member, role) {
    busy.value = true
    try {
      await apiRequest(`/api/channels/${encodeURIComponent(slug)}/members/${encodeURIComponent(member.id)}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role })
      })
      members.value = members.value.map(item => item.id === member.id ? { ...item, role } : item)
    } catch (requestError) {
      error.value = requestError.message || 'Could not update member'
    } finally {
      busy.value = false
    }
  }

  function addPost(post) {
    posts.value = [post, ...posts.value]
    if (post.moderationStatus === 'approved') {
      channel.value = { ...channel.value, postCount: channel.value.postCount + 1 }
    }
  }

  function removePost(postId) {
    const removedPost = posts.value.find(post => post.id === postId) || channel.value.pinnedPost
    posts.value = posts.value.filter(post => post.id !== postId)
    if (removedPost?.moderationStatus === 'approved') {
      channel.value = { ...channel.value, postCount: Math.max(0, channel.value.postCount - 1) }
    }
    if (channel.value.pinnedPost?.id === postId) {
      channel.value = { ...channel.value, pinnedPostId: null, pinnedPost: null }
    }
  }

  function updatePost(updatedPost) {
    const previousPost = posts.value.find(post => post.id === updatedPost.id)
    posts.value = posts.value.map(post => post.id === updatedPost.id ? { ...post, ...updatedPost } : post)
    if (previousPost?.moderationStatus !== 'approved' && updatedPost.moderationStatus === 'approved') {
      channel.value = { ...channel.value, postCount: channel.value.postCount + 1 }
    } else if (previousPost?.moderationStatus === 'approved' && updatedPost.moderationStatus !== 'approved') {
      channel.value = { ...channel.value, postCount: Math.max(0, channel.value.postCount - 1) }
    }
    if (channel.value.pinnedPost?.id === updatedPost.id) {
      channel.value = {
        ...channel.value,
        pinnedPostId: updatedPost.moderationStatus === 'approved' ? updatedPost.id : null,
        pinnedPost: updatedPost.moderationStatus === 'approved' ? updatedPost : null
      }
    }
  }

  function updatePinned(updatedChannel) {
    channel.value = updatedChannel
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channel…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channel unavailable" description={error.value} /></Card>
    return (
      <div class="channel-detail-stack">
        <Card class="channel-hero-card">
          {channel.value.imageUrl
            ? <img class="channel-hero-image" src={channel.value.imageUrl} alt="" loading="lazy" decoding="async" />
            : <span class="channel-hero-placeholder" aria-hidden="true">{channel.value.name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <Label size="large">{channel.value.name}</Label>
            <p class="channel-slug">/{channel.value.slug} · {channel.value.visibility}</p>
            <p>{channel.value.description || 'No description yet.'}</p>
            <span>{channel.value.memberCount} members · {channel.value.postCount} posts</span>
            {channel.value.postApprovalRequired && <span class="channel-approval-note">New member posts need approval.</span>}
          </div>
          <div class="channel-hero-actions">
            {!channel.value.isOwner && (
              <Button
                loading={busy}
                variant={channel.value.membershipRole ? 'secondary' : 'primary'}
                ariaLabel={computed(() => channel.value.membershipRole ? 'Leave this channel' : 'Join this channel')}
                onClick={toggleMembership}
              >
                {channel.value.membershipRole ? 'Leave' : channel.value.invited ? 'Accept invite' : 'Join'}
              </Button>
            )}
            {channel.value.membershipRole && <>
              <Button variant="tertiary" size="small" loading={busy} onClick={() => updatePreferences({ muted: !channel.value.muted })}>
                {channel.value.muted ? 'Unmute channel' : 'Mute channel'}
              </Button>
              <Button variant="tertiary" size="small" loading={busy} onClick={() => updatePreferences({ notificationsEnabled: !channel.value.notificationsEnabled })}>
                {channel.value.notificationsEnabled ? 'Turn off alerts' : 'Turn on alerts'}
              </Button>
            </>}
            {!channel.value.isOwner && <ReportButton targetType="channel" targetId={channel.value.id} label="Report channel" />}
          </div>
        </Card>
        {channel.value.rules && <Card class="channel-rules-card"><Label size="small" tone="accent">CHANNEL RULES</Label><pre>{channel.value.rules}</pre></Card>}
        {channel.value.isOwner && (
          <div class="channel-owner-grid">
            <Card>
              <Label size="small" tone="accent">OWNER CONTROLS</Label>
              <form class="channel-form" onSubmit={saveChannel}>
                <FormField id="edit-channel-name" label="Name"><TextField id="edit-channel-name" value={name} maxLength={80} required /></FormField>
                <FormField id="edit-channel-image" label="Image URL"><TextField id="edit-channel-image" value={imageUrl} type="url" maxLength={2000} /></FormField>
                <FormField id="edit-channel-description" label="Description"><textarea id="edit-channel-description" class="post-composer-input" use:bind={description} maxlength="280" rows="3" /></FormField>
                <FormField id="edit-channel-rules" label="Rules" hint="One rule per line. Up to 2,000 characters."><textarea id="edit-channel-rules" class="post-composer-input" use:bind={rules} maxlength="2000" rows="6" /></FormField>
                <CheckBox checked={privateChannel}>Private channel</CheckBox>
                <CheckBox checked={postApprovalRequired}>Approve member posts before publishing</CheckBox>
                <Button type="submit" loading={busy}>Save</Button>
              </form>
            </Card>
            <Card>
              <Label size="small" tone="accent">INVITE</Label>
              <form class="channel-form" onSubmit={invite}>
                <FormField id="invite-username" label="Username"><TextField id="invite-username" value={inviteUsername} required /></FormField>
                <Button type="submit" loading={busy}>Send invite</Button>
              </form>
            </Card>
          </div>
        )}
        <Card class="channel-members-card">
          <Label size="small" tone="accent">MEMBERS</Label>
          <div class="channel-member-list">
            {members.value.map(member => (
              <div key={member.id} class="channel-member-row">
                <a href={`/users/${member.username}`} onClick={router.link(`/users/${member.username}`)}>{member.displayName} <span>@{member.username}</span></a>
                <span>{member.role}</span>
                {channel.value.isOwner && member.role !== 'owner' && (
                  <Button variant="tertiary" size="small" onClick={() => changeRole(member, member.role === 'moderator' ? 'member' : 'moderator')}>
                    {member.role === 'moderator' ? 'Make member' : 'Make moderator'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
        {channel.value.pinnedPost && <Card class="channel-pinned-post"><div class="post-replies-heading"><Label size="small" tone="accent">PINNED POST</Label></div><PostCard post={channel.value.pinnedPost} router={router} currentUserId={currentUserId} onDeleted={removePost} onUpdated={updatePost} /><ChannelPostModeration slug={slug} post={channel.value.pinnedPost} canPin={channel.value.canModerate} pinned onPinned={updatePinned} /></Card>}
        {channel.value.membershipRole && <PostComposer channelId={channel.value.id} onCreated={addPost} />}
        <div class="post-replies-heading"><Label size="small" tone="accent">CHANNEL FEED</Label></div>
        {posts.value.length
          ? <KeyboardList label="Channel post feed" className="post-feed-keyboard post-feed">
            <VirtualList
              items={posts}
              estimateSize={420}
              label="Channel post feed"
              renderItem={post => (
                <div class="channel-post-item">
                  <PostCard post={post} router={router} currentUserId={currentUserId} onDeleted={removePost} onUpdated={updatePost} onReposted={addPost} />
                  {channel.value.canModerate && <ChannelPostModeration slug={slug} post={post} canPin pinned={channel.value.pinnedPost?.id === post.id} onChanged={updatePost} onPinned={updatePinned} />}
                </div>
              )}
            />
          </KeyboardList>
          : <Card><EmptyState title="No posts yet" description="Members can start this channel." /></Card>}
        <div class="post-feed-error" role="alert">{error}</div>
        <LiveRegion message={announcement} />
      </div>
    )
  })

  onMount(() => {
    let active = true
    let leaveRoom
    load().then(() => {
      if (active && channel.value) leaveRoom = joinRealtimeRoom('channel', channel.value.id)
    })
    return () => {
      active = false
      leaveRoom?.()
    }
  })

  return (
    <PageFrame eyebrow="COMMUNITIES / CHANNEL" title={slug} description="A focused space for shared conversation.">
      <a class="back-link" href="/channels" onClick={router.link('/channels')}>← All channels</a>
      {content}
    </PageFrame>
  )
}

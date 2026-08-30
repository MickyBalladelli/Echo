import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from '../components/PostCard.jsx'
import { PostComposer } from '../components/PostComposer.jsx'
import { PageFrame } from './PageFrame.jsx'
import { joinRealtimeRoom } from '../lib/realtime.js'

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
  const privateChannel = signal(false)

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
      privateChannel.value = channel.value.visibility === 'private'
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load channel'
      state.value = 'error'
    }
  }

  async function toggleMembership() {
    busy.value = true
    error.value = ''
    try {
      await apiRequest(`/api/channels/${encodeURIComponent(slug)}/membership`, {
        method: channel.value.membershipRole ? 'DELETE' : 'PUT'
      })
      await load()
    } catch (requestError) {
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
          visibility: privateChannel.value ? 'private' : 'public'
        })
      })
      channel.value = result.data.channel
    } catch (requestError) {
      error.value = requestError.message || 'Could not save channel'
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
    channel.value = { ...channel.value, postCount: channel.value.postCount + 1 }
  }

  function removePost(postId) {
    posts.value = posts.value.filter(post => post.id !== postId)
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channel…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channel unavailable" description={error.value} /></Card>
    return (
      <div class="channel-detail-stack">
        <Card class="channel-hero-card">
          {channel.value.imageUrl
            ? <img class="channel-hero-image" src={channel.value.imageUrl} alt="" />
            : <span class="channel-hero-placeholder" aria-hidden="true">{channel.value.name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <Label size="large">{channel.value.name}</Label>
            <p class="channel-slug">/{channel.value.slug} · {channel.value.visibility}</p>
            <p>{channel.value.description || 'No description yet.'}</p>
            <span>{channel.value.memberCount} members · {channel.value.postCount} posts</span>
          </div>
          {!channel.value.isOwner && (
            <Button loading={busy} variant={channel.value.membershipRole ? 'secondary' : 'primary'} onClick={toggleMembership}>
              {channel.value.membershipRole ? 'Leave' : channel.value.invited ? 'Accept invite' : 'Join'}
            </Button>
          )}
        </Card>
        {channel.value.isOwner && (
          <div class="channel-owner-grid">
            <Card>
              <Label size="small" tone="accent">OWNER CONTROLS</Label>
              <form class="channel-form" onSubmit={saveChannel}>
                <FormField id="edit-channel-name" label="Name"><TextField id="edit-channel-name" value={name} maxLength={80} required /></FormField>
                <FormField id="edit-channel-image" label="Image URL"><TextField id="edit-channel-image" value={imageUrl} type="url" maxLength={2000} /></FormField>
                <FormField id="edit-channel-description" label="Description"><textarea id="edit-channel-description" class="post-composer-input" use:bind={description} maxlength="280" rows="3" /></FormField>
                <CheckBox checked={privateChannel}>Private channel</CheckBox>
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
        {channel.value.membershipRole && <PostComposer channelId={channel.value.id} onCreated={addPost} />}
        <div class="post-replies-heading"><Label size="small" tone="accent">CHANNEL FEED</Label></div>
        {posts.value.length
          ? <div class="post-feed">{posts.value.map(post => <PostCard key={post.id} post={post} router={router} currentUserId={currentUserId} onDeleted={removePost} />)}</div>
          : <Card><EmptyState title="No posts yet" description="Members can start this channel." /></Card>}
        <div class="post-feed-error" role="alert">{error}</div>
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

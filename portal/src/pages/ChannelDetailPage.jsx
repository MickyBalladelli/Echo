import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, Popup, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PageFrame } from './PageFrame.jsx'
import { joinRealtimeRoom } from '../lib/realtime.js'
import { ReportButton } from '../components/ReportButton.jsx'
import { LiveRegion } from '../components/LiveRegion.jsx'
import { ChannelChat } from '../components/ChannelChat.jsx'

export function ChannelDetailPage({ slug, router, currentUserId, currentUsername, onHeaderChange = () => {} }) {
  const channel = signal(null)
  const members = signal([])
  const state = signal('loading')
  const error = signal('')
  const busy = signal(false)
  const inviteUsername = signal('')
  const name = signal('')
  const description = signal('')
  const imageUrl = signal('')
  const rules = signal('')
  const privateChannel = signal(false)
  const announcement = signal('')
  const detailsOpen = signal(false)

  async function load() {
    state.value = 'loading'
    error.value = ''
    try {
      const encodedSlug = encodeURIComponent(slug)
      const [channelResult, membersResult] = await Promise.all([
        apiRequest(`/api/channels/${encodedSlug}`),
        apiRequest(`/api/channels/${encodedSlug}/members`)
      ])
      channel.value = channelResult.data.channel
      members.value = membersResult.data
      name.value = channel.value.name
      description.value = channel.value.description
      imageUrl.value = channel.value.imageUrl || ''
      rules.value = channel.value.rules || ''
      privateChannel.value = channel.value.visibility === 'private'
      state.value = 'ready'
      onHeaderChange({
        name: channel.value.name,
        visibility: channel.value.visibility
      })
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
      window.dispatchEvent(new CustomEvent('echo:channels-changed'))
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
          rules: rules.value
        })
      })
      channel.value = result.data.channel
      onHeaderChange({
        name: channel.value.name,
        visibility: channel.value.visibility
      })
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

  const headerActions = computed(() => {
    if (state.value !== 'ready' || !channel.value) return null

    return (
      <div class="channel-header-actions">
        {!channel.value.isOwner && (
          <Button
            loading={busy}
            variant={channel.value.membershipRole ? 'secondary' : 'primary'}
            ariaLabel={computed(() => channel.value.membershipRole ? 'Leave this channel' : 'Join this channel')}
            onClick={toggleMembership}
          >
            {channel.value.membershipRole ? 'Leave' : channel.value.invited ? 'Accept invite' : 'Join channel'}
          </Button>
        )}
        <Button variant="tertiary" onClick={() => detailsOpen.value = true}>
          {channel.value.isOwner ? 'Manage channel' : 'Channel details'}
        </Button>
      </div>
    )
  })

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channel…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channel unavailable" description={error.value} /></Card>

    const membersCard = (
      <Card class="channel-members-card">
        <div class="channel-section-heading">
          <Label size="small" tone="accent">MEMBERS</Label>
          <h3>{channel.value.isOwner ? 'Manage members' : 'People in this channel'}</h3>
          <p>{channel.value.isOwner ? 'Change member roles here. Inviting people is optional for public channels.' : `${channel.value.memberCount} people are part of this channel.`}</p>
        </div>
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
    )

    const channelDetails = (
      <div class="channel-dialog-stack">
        <Card class="channel-dialog-summary">
          <div class="channel-section-heading">
            <Label size="small" tone="accent">ABOUT THIS CHANNEL</Label>
            <p class="channel-slug">/{channel.value.slug} · {channel.value.visibility}</p>
            <p>{channel.value.description || 'No description yet.'}</p>
            <span>{channel.value.memberCount} members</span>
          </div>
        </Card>
        {channel.value.rules && <Card class="channel-rules-card"><Label size="small" tone="accent">CHANNEL RULES</Label><pre>{channel.value.rules}</pre></Card>}
        {!channel.value.isOwner && (
          <Card class="channel-dialog-card">
            <div class="channel-section-heading">
              <Label size="small" tone="accent">YOUR ACCESS</Label>
              <h3>{channel.value.membershipRole ? 'Your channel settings' : 'Join this channel'}</h3>
              <p>{channel.value.membershipRole ? 'Control alerts or leave whenever you want.' : 'Join to chat and send messages in this channel.'}</p>
            </div>
            {channel.value.membershipRole && (
              <div class="channel-dialog-actions">
                <Button variant="tertiary" size="small" loading={busy} onClick={() => updatePreferences({ muted: !channel.value.muted })}>
                  {channel.value.muted ? 'Unmute channel' : 'Mute channel'}
                </Button>
                <Button variant="tertiary" size="small" loading={busy} onClick={() => updatePreferences({ notificationsEnabled: !channel.value.notificationsEnabled })}>
                  {channel.value.notificationsEnabled ? 'Turn off alerts' : 'Turn on alerts'}
                </Button>
                <ReportButton targetType="channel" targetId={channel.value.id} label="Report channel" />
              </div>
            )}
          </Card>
        )}
        {channel.value.isOwner && (
          <>
            <Card class="channel-dialog-card">
              <div class="channel-section-heading">
                <Label size="small" tone="accent">SETTINGS</Label>
                <h3>Channel settings</h3>
                <p>Change how this channel looks and works.</p>
              </div>
              <form class="channel-form" onSubmit={saveChannel}>
                <FormField id="edit-channel-name" label="Name"><TextField id="edit-channel-name" value={name} maxLength={80} required /></FormField>
                <FormField id="edit-channel-image" label="Image URL"><TextField id="edit-channel-image" value={imageUrl} type="url" maxLength={2000} /></FormField>
                <FormField id="edit-channel-description" label="Description"><textarea id="edit-channel-description" class="post-composer-input" use:bind={description} maxlength="280" rows="3" /></FormField>
                <FormField id="edit-channel-rules" label="Rules" hint="One rule per line. Up to 2,000 characters."><textarea id="edit-channel-rules" class="post-composer-input" use:bind={rules} maxlength="2000" rows="6" /></FormField>
                <CheckBox checked={privateChannel}>Private channel (invite only)</CheckBox>
                <Button type="submit" loading={busy}>Save settings</Button>
              </form>
            </Card>
            <Card class="channel-dialog-card">
              <div class="channel-section-heading">
                <Label size="small" tone="accent">OPTIONAL INVITES</Label>
                <h3>Invite someone</h3>
                <p>Useful for private channels. Public channels can grow without invitations.</p>
              </div>
              <form class="channel-form" onSubmit={invite}>
                <FormField id="invite-username" label="Username"><TextField id="invite-username" value={inviteUsername} required /></FormField>
                <Button type="submit" loading={busy}>Send invite</Button>
              </form>
            </Card>
          </>
        )}
        {membersCard}
      </div>
    )

    return (
      <div class="channel-detail-stack">
        <section class="channel-message-section" aria-label="Channel messages">
          <ChannelChat
            slug={slug}
            channel={channel}
            members={members}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
          />
        </section>
        <Popup
          open={detailsOpen}
          eyebrow={channel.value.isOwner ? 'CHANNEL MANAGEMENT' : 'CHANNEL DETAILS'}
          title={channel.value.name}
          ariaDescription={channel.value.isOwner ? 'Manage this channel, its members, and its settings.' : 'View channel details and manage your membership.'}
          size="large"
          class="channel-details-popup"
          onClose={() => detailsOpen.value = false}
        >
          {channelDetails}
        </Popup>
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
    <PageFrame
      eyebrow="COMMUNITIES / CHANNEL"
      title={computed(() => channel.value?.name || slug)}
      description={computed(() => channel.value?.visibility === 'private' ? 'Private chat room · invite only.' : 'Public chat room · anyone can join.')}
      headerActions={headerActions}
      hideHeader
    >
      {content}
    </PageFrame>
  )
}

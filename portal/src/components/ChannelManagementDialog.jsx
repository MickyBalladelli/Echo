import { computed, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, Popup, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ChannelManagementDialog({ channel: initialChannel, onUpdated }) {
  const open = signal(false)
  const state = signal('ready')
  const error = signal('')
  const busy = signal(false)
  const channel = signal(initialChannel)
  const members = signal([])
  const inviteUsername = signal('')
  const name = signal(initialChannel.name)
  const slug = signal(initialChannel.slug)
  const description = signal(initialChannel.description || '')
  const imageUrl = signal(initialChannel.imageUrl || '')
  const rules = signal(initialChannel.rules || '')
  const privateChannel = signal(initialChannel.visibility === 'private')

  function syncFields(nextChannel) {
    channel.value = nextChannel
    name.value = nextChannel.name
    slug.value = nextChannel.slug
    description.value = nextChannel.description || ''
    imageUrl.value = nextChannel.imageUrl || ''
    rules.value = nextChannel.rules || ''
    privateChannel.value = nextChannel.visibility === 'private'
  }

  async function openDialog() {
    open.value = true
    state.value = 'loading'
    error.value = ''
    try {
      const encodedSlug = encodeURIComponent(slug.value)
      const [channelResult, membersResult] = await Promise.all([
        apiRequest(`/api/channels/${encodedSlug}`),
        apiRequest(`/api/channels/${encodedSlug}/members`)
      ])
      syncFields(channelResult.data.channel)
      members.value = membersResult.data
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load channel settings'
      state.value = 'error'
    }
  }

  function close() {
    if (busy.value) return
    open.value = false
  }

  async function saveChannel(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      const currentSlug = slug.value
      const result = await apiRequest(`/api/channels/${encodeURIComponent(currentSlug)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.value,
          slug: slug.value,
          description: description.value,
          imageUrl: imageUrl.value.trim() || null,
          visibility: privateChannel.value ? 'private' : 'public',
          rules: rules.value
        })
      })
      syncFields(result.data.channel)
      onUpdated?.(result.data.channel)
      window.dispatchEvent(new CustomEvent('echo:channels-changed'))
    } catch (requestError) {
      error.value = requestError.message || 'Could not save channel'
    } finally {
      busy.value = false
    }
  }

  async function invite(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      await apiRequest(`/api/channels/${encodeURIComponent(slug.value)}/invites`, {
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

  async function changeRole(member, role) {
    busy.value = true
    error.value = ''
    try {
      await apiRequest(`/api/channels/${encodeURIComponent(slug.value)}/members/${encodeURIComponent(member.id)}/role`, {
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

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channel settings…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channel unavailable" description={error.value} /></Card>

    return (
      <div class="channel-dialog-stack">
        <Card class="channel-dialog-card">
          <div class="channel-section-heading">
            <Label size="small" tone="accent">SETTINGS</Label>
            <h3>Channel settings</h3>
            <p>Change how this channel looks and works.</p>
          </div>
          <form class="channel-form" onSubmit={saveChannel}>
            <FormField id={`manage-channel-name-${initialChannel.id}`} label="Name">
              <TextField id={`manage-channel-name-${initialChannel.id}`} value={name} maxLength={80} required />
            </FormField>
            <FormField id={`manage-channel-slug-${initialChannel.id}`} label="Endpoint" hint="The URL ending. Lowercase words and hyphens.">
              <div class="channel-endpoint-field">
                <span aria-hidden="true">/</span>
                <TextField id={`manage-channel-slug-${initialChannel.id}`} value={slug} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
              </div>
            </FormField>
            <FormField id={`manage-channel-image-${initialChannel.id}`} label="Image URL">
              <TextField id={`manage-channel-image-${initialChannel.id}`} value={imageUrl} type="url" maxLength={2000} />
            </FormField>
            <FormField id={`manage-channel-description-${initialChannel.id}`} label="Description">
              <textarea id={`manage-channel-description-${initialChannel.id}`} class="post-composer-input" use:bind={description} maxlength="280" rows="3" />
            </FormField>
            <FormField id={`manage-channel-rules-${initialChannel.id}`} label="Rules" hint="One rule per line. Up to 2,000 characters.">
              <textarea id={`manage-channel-rules-${initialChannel.id}`} class="post-composer-input" use:bind={rules} maxlength="2000" rows="6" />
            </FormField>
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
            <FormField id={`manage-invite-username-${initialChannel.id}`} label="Username">
              <TextField id={`manage-invite-username-${initialChannel.id}`} value={inviteUsername} required />
            </FormField>
            <Button type="submit" loading={busy}>Send invite</Button>
          </form>
        </Card>
        <Card class="channel-members-card">
          <div class="channel-section-heading">
            <Label size="small" tone="accent">MEMBERS</Label>
            <h3>Manage members</h3>
            <p>Change member roles here.</p>
          </div>
          <div class="channel-member-list">
            {members.value.map(member => (
              <div key={member.id} class="channel-member-row">
                <span>{member.displayName} <small>@{member.username}</small></span>
                <span>{member.role}</span>
                {member.role !== 'owner' && (
                  <Button variant="tertiary" size="small" loading={busy} onClick={() => changeRole(member, member.role === 'moderator' ? 'member' : 'moderator')}>
                    {member.role === 'moderator' ? 'Make member' : 'Make moderator'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
        <div class="post-feed-error" role="alert">{error}</div>
      </div>
    )
  })

  return (
    <div class="channel-management-dialog">
      <Button class="channel-card-action" variant="tertiary" size="small" type="button" onClick={openDialog}>Manage channel</Button>
      <Popup
        open={open}
        eyebrow="CHANNEL MANAGEMENT"
        title={computed(() => channel.value?.name || initialChannel.name)}
        ariaDescription="Manage this channel, its settings, invites, and members."
        size="large"
        class="channel-details-popup"
        onClose={close}
      >
        {content}
      </Popup>
    </div>
  )
}

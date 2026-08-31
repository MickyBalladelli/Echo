import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, Select, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

function channelInitial(channel) {
  return channel.name.slice(0, 1).toUpperCase()
}

function channelActionLabel(channel) {
  if (channel.isOwner) return 'Manage channel'
  if (channel.membershipRole) return 'Open chat'
  if (channel.invited) return 'Accept invite'
  return 'Join channel'
}

function channelAccessLabel(channel) {
  if (channel.isOwner) return 'You own this channel'
  if (channel.membershipRole) return 'You are a member'
  if (channel.invited) return 'You have an invite'
  return channel.visibility === 'public' ? 'Public · anyone can join' : 'Private · invite only'
}

export function ChannelDirectory({ router }) {
  const channels = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const loadingMore = signal(false)
  const creating = signal(false)
  const name = signal('')
  const slug = signal('')
  const description = signal('')
  const imageUrl = signal('')
  const rules = signal('')
  const visibility = signal('public')

  async function load({ append = false } = {}) {
    if (append) loadingMore.value = true
    else state.value = 'loading'
    try {
      const parameters = new URLSearchParams({ limit: '20' })
      if (append && nextCursor.value) parameters.set('cursor', nextCursor.value)
      const result = await apiRequest(`/api/channels?${parameters.toString()}`)
      channels.value = append ? [...channels.value, ...result.data] : result.data
      nextCursor.value = result.meta?.nextCursor || null
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load channels'
      state.value = 'error'
    } finally {
      loadingMore.value = false
    }
  }

  async function create(event) {
    event.preventDefault()
    creating.value = true
    error.value = ''
    try {
      const result = await apiRequest('/api/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: name.value,
          ...(slug.value.trim() ? { slug: slug.value } : {}),
          description: description.value,
          imageUrl: imageUrl.value.trim() || null,
          visibility: visibility.value,
          rules: rules.value
        })
      })
      window.dispatchEvent(new CustomEvent('echo:channels-changed'))
      router.navigate(`/channels/${result.data.channel.slug}`)
    } catch (requestError) {
      error.value = requestError.message || 'Could not create channel'
    } finally {
      creating.value = false
    }
  }

  const renderChannelCard = channel => (
    <a key={channel.id} class="channel-card-link" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}>
      <Card class="channel-card">
        {channel.imageUrl
          ? <img class="channel-card-image" src={channel.imageUrl} alt="" loading="lazy" decoding="async" />
          : <span class="channel-card-placeholder" aria-hidden="true">{channelInitial(channel)}</span>}
        <div class="channel-card-copy">
          <Label size="large">{channel.name}</Label>
          <span class="channel-slug">/{channel.slug}</span>
          <p>{channel.description || 'No description yet.'}</p>
          <span class="channel-card-access">{channelAccessLabel(channel)}</span>
        </div>
        <span class="channel-card-action">{channelActionLabel(channel)} →</span>
        <span class="channel-card-counts">{channel.memberCount} members</span>
      </Card>
    </a>
  )

  const list = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channels…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channels unavailable" description={error.value} /></Card>
    const ownedChannels = channels.value.filter(channel => channel.isOwner)
    const discoverableChannels = channels.value.filter(channel => !channel.isOwner)

    return (
      <>
        {ownedChannels.length > 0 && (
          <section class="channel-list-section" aria-labelledby="your-channels-title">
            <div class="channel-section-heading">
              <Label size="small" tone="accent">YOUR CHANNELS</Label>
              <h2 id="your-channels-title">Manage your channels</h2>
              <p>Open a channel to manage its settings, members, and chat.</p>
            </div>
            <div class="channel-grid">{ownedChannels.map(renderChannelCard)}</div>
          </section>
        )}
        <section class="channel-list-section" aria-labelledby="discover-channels-title">
          <div class="channel-section-heading">
            <Label size="small" tone="accent">DISCOVER & JOIN</Label>
            <h2 id="discover-channels-title">Find a channel</h2>
            <p>Open a public channel to join the chat. Private channels need an invite.</p>
          </div>
          {discoverableChannels.length > 0
            ? <div class="channel-grid">{discoverableChannels.map(renderChannelCard)}</div>
            : <Card><EmptyState title="No channels to discover" description="Create a public channel and start the first conversation." /></Card>}
        </section>
      </>
    )
  })
  const pagination = computed(() => nextCursor.value
    ? <div class="feed-load-more"><Button variant="secondary" loading={loadingMore} onClick={() => load({ append: true })}>Load more</Button></div>
    : null)

  onMount(() => load())

  return (
    <div class="channels-stack">
      <section class="channel-management-section" aria-labelledby="create-channel-title">
        <div class="channel-section-heading">
          <Label size="small" tone="accent">MANAGE CHANNELS</Label>
          <h2 id="create-channel-title">Create a channel</h2>
          <p>Set up a space first. You can invite people later, or leave it public so anyone can join.</p>
        </div>
        <Card class="channel-create-card">
          <form class="channel-form" onSubmit={create}>
            <FormField id="channel-name" label="Name" required>
              <TextField id="channel-name" value={name} minLength={2} maxLength={80} required />
            </FormField>
            <FormField id="channel-slug" label="Slug" hint="Optional. Lowercase words and hyphens.">
              <TextField id="channel-slug" value={slug} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            </FormField>
            <FormField id="channel-image" label="Image URL">
              <TextField id="channel-image" value={imageUrl} type="url" maxLength={2000} placeholder="https://…" />
            </FormField>
            <FormField id="channel-description" label="Description">
              <textarea id="channel-description" class="post-composer-input" use:bind={description} maxlength="280" rows="3" />
            </FormField>
            <FormField id="channel-rules" label="Rules" hint="One rule per line. Up to 2,000 characters.">
              <textarea id="channel-rules" class="post-composer-input" use:bind={rules} maxlength="2000" rows="4" />
            </FormField>
            <FormField id="channel-visibility" label="Visibility" hint="Public channels are discoverable and need no invites.">
              <Select
                id="channel-visibility"
                value={visibility}
                ariaLabel="Channel visibility"
                options={[
                  { value: 'public', label: 'Public — anyone can join' },
                  { value: 'private', label: 'Private — invite only' }
                ]}
              />
            </FormField>
            <Button type="submit" loading={creating}>Create channel</Button>
          </form>
          <div class="post-feed-error" role="alert">{error}</div>
        </Card>
      </section>
      {list}
      {pagination}
    </div>
  )
}

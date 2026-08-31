import { computed, onMount, signal } from '../lib/vendor.js'
import { Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { ChannelDiscoveryDialog } from './ChannelDiscoveryDialog.jsx'
import { ChannelManagementDialog } from './ChannelManagementDialog.jsx'

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

function channelMemberLabel(channel) {
  return `${channel.memberCount} member${channel.memberCount === 1 ? '' : 's'}`
}

export function ChannelDirectory({ router }) {
  const channels = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const loadingMore = signal(false)

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

  function updateChannel(updatedChannel) {
    channels.value = channels.value.map(channel => channel.id === updatedChannel.id ? { ...channel, ...updatedChannel } : channel)
  }

  const renderChannelCard = channel => {
    const card = (
      <Card class="channel-card">
        <div class="channel-card-preview">
          {channel.imageUrl
            ? <img class="channel-card-image" src={channel.imageUrl} alt="" loading="lazy" decoding="async" />
            : <span class="channel-card-placeholder" aria-hidden="true">{channelInitial(channel)}</span>}
          <div class="channel-card-copy">
            <div class="channel-card-title-row">
              <a class="channel-card-title-link" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}><Label size="large">{channel.name}</Label></a>
              <p>{channel.description || 'No description yet.'}</p>
            </div>
            <div class="channel-card-description-row">
              <a class="channel-card-slug-link channel-slug" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}>/{channel.slug}</a>
              <span class="channel-card-counts">{channelMemberLabel(channel)}</span>
              <span class="channel-card-access">{channelAccessLabel(channel)}</span>
            </div>
          </div>
        </div>
        {channel.isOwner
          ? <ChannelManagementDialog channel={channel} onUpdated={updateChannel} />
          : <button class="channel-card-action channel-card-action-button" type="button" onClick={() => router.navigate(`/channels/${channel.slug}`)}>{channelActionLabel(channel)} →</button>}
      </Card>
    )

    return <div key={channel.id} class="channel-card-shell">{card}</div>
  }

  const list = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channels…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channels unavailable" description={error.value} /></Card>
    const ownedChannels = channels.value.filter(channel => channel.isOwner)

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
        {ownedChannels.length === 0 && (
          <Card><EmptyState title="No channels yet" description="Create a channel or find one to join." /></Card>
        )}
      </>
    )
  })
  onMount(() => load())

  return (
    <div class="channels-stack">
      <ChannelDiscoveryDialog
        channels={channels}
        state={state}
        error={error}
        loadingMore={loadingMore}
        nextCursor={nextCursor}
        onLoadMore={() => load({ append: true })}
        router={router}
      />
      {list}
    </div>
  )
}

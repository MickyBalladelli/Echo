import { computed, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label, Popup, Tooltip } from '../lib/vendor.js'

export function ChannelDiscoveryDialog({ channels, state, error, loadingMore, nextCursor, onLoadMore, router }) {
  const open = signal(false)

  function channelInitial(channel) {
    return channel.name.slice(0, 1).toUpperCase()
  }

  function channelActionLabel(channel) {
    if (channel.membershipRole) return 'Open chat'
    if (channel.invited) return 'Accept invite'
    return 'Join channel'
  }

  function channelAccessLabel(channel) {
    if (channel.membershipRole) return 'You are a member'
    if (channel.invited) return 'You have an invite'
    return channel.visibility === 'public' ? 'Public · anyone can join' : 'Private · invite only'
  }

  function channelMemberLabel(channel) {
    return `${channel.memberCount} member${channel.memberCount === 1 ? '' : 's'}`
  }

  const discoverableChannels = computed(() => channels.value.filter(channel => !channel.isOwner))

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channels…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channels unavailable" description={error.value} /></Card>
    if (discoverableChannels.value.length === 0) {
      return <Card><EmptyState title="No channels to discover" description="Create a public channel and start the first conversation." /></Card>
    }

    return (
      <>
        <div class="channel-grid">
          {discoverableChannels.value.map(channel => (
            <Card key={channel.id} class="channel-card">
              <div class="channel-card-preview">
                {channel.imageUrl
                  ? <img class="channel-card-image" src={channel.imageUrl} alt="" loading="lazy" decoding="async" />
                  : <span class="channel-card-placeholder" aria-hidden="true">{channelInitial(channel)}</span>}
                <div class="channel-card-copy">
                  <div class="channel-card-title-row">
                    <a class="channel-card-title-link" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}><Label size="large">{channel.name}</Label></a>
                    <Tooltip class="channel-card-description-tooltip" content={channel.description || 'No description yet.'} placement="top">
                      <p>{channel.description || 'No description yet.'}</p>
                    </Tooltip>
                  </div>
                  <div class="channel-card-description-row">
                    <a class="channel-card-slug-link channel-slug" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}>/{channel.slug}</a>
                    <span class="channel-card-counts">{channelMemberLabel(channel)}</span>
                    <span class="channel-card-access">{channelAccessLabel(channel)}</span>
                  </div>
                </div>
              </div>
              <button class="channel-card-action channel-card-action-button" type="button" onClick={() => router.navigate(`/channels/${channel.slug}`)}>{channelActionLabel(channel)} →</button>
            </Card>
          ))}
        </div>
        {nextCursor.value && (
          <div class="feed-load-more">
            <Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>Load more</Button>
          </div>
        )}
      </>
    )
  })

  return (
    <>
      <div class="channel-discovery-trigger">
        <div class="channel-section-heading">
          <Label size="small" tone="accent">DISCOVER & JOIN</Label>
          <h2>Find a channel</h2>
          <p>Browse public channels and join a conversation. Private channels need an invite.</p>
        </div>
        <Button variant="secondary" type="button" onClick={() => open.value = true}>Find a channel</Button>
      </div>
      <Popup
        open={open}
        eyebrow="DISCOVER & JOIN"
        title="Find a channel"
        ariaDescription="Browse channels you can join and open their chats."
        size="large"
        class="channel-discovery-popup"
        onClose={() => open.value = false}
      >
        <div class="channel-discovery-dialog-content">
          <p class="channel-discovery-dialog-intro">Browse public channels, join one, and start chatting.</p>
          {content}
        </div>
      </Popup>
    </>
  )
}

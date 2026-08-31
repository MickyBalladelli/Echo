import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

function channelInitial(channel) {
  return channel.name.slice(0, 1).toUpperCase()
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
  const postApprovalRequired = signal(false)
  const privateChannel = signal(false)

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
          visibility: privateChannel.value ? 'private' : 'public',
          rules: rules.value,
          postApprovalRequired: postApprovalRequired.value
        })
      })
      router.navigate(`/channels/${result.data.channel.slug}`)
    } catch (requestError) {
      error.value = requestError.message || 'Could not create channel'
    } finally {
      creating.value = false
    }
  }

  const list = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading channels…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Channels unavailable" description={error.value} /></Card>
    if (!channels.value.length) return <Card><EmptyState title="No channels yet" description="Create the first focused space." /></Card>
    return (
      <div class="channel-grid">
        {channels.value.map(channel => (
          <a key={channel.id} class="channel-card-link" href={`/channels/${channel.slug}`} onClick={router.link(`/channels/${channel.slug}`)}>
            <Card class="channel-card">
              {channel.imageUrl
                ? <img class="channel-card-image" src={channel.imageUrl} alt="" />
                : <span class="channel-card-placeholder" aria-hidden="true">{channelInitial(channel)}</span>}
              <div>
                <Label size="large">{channel.name}</Label>
                <span class="channel-slug">/{channel.slug} · {channel.visibility}</span>
                <p>{channel.description || 'No description yet.'}</p>
              </div>
              <span class="channel-card-counts">{channel.memberCount} members · {channel.postCount} posts</span>
            </Card>
          </a>
        ))}
      </div>
    )
  })
  const pagination = computed(() => nextCursor.value
    ? <div class="feed-load-more"><Button variant="secondary" loading={loadingMore} onClick={() => load({ append: true })}>Load more</Button></div>
    : null)

  onMount(() => load())

  return (
    <div class="channels-stack">
      <Card class="channel-create-card">
        <Label size="small" tone="accent">CREATE CHANNEL</Label>
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
          <CheckBox checked={privateChannel}>Private channel</CheckBox>
          <CheckBox checked={postApprovalRequired}>Approve member posts before publishing</CheckBox>
          <Button type="submit" loading={creating}>Create channel</Button>
        </form>
        <div class="post-feed-error" role="alert">{error}</div>
      </Card>
      {list}
      {pagination}
    </div>
  )
}

import { signal } from '../lib/vendor.js'
import { Button, FormField, Popup, Select, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ChannelCreateDialog({ router }) {
  const open = signal(false)
  const creating = signal(false)
  const error = signal('')
  const name = signal('')
  const slug = signal('')
  const description = signal('')
  const imageUrl = signal('')
  const rules = signal('')
  const visibility = signal('public')

  function close() {
    if (creating.value) return
    open.value = false
    error.value = ''
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
      open.value = false
      router.navigate(`/channels/${result.data.channel.slug}`)
    } catch (requestError) {
      error.value = requestError.message || 'Could not create channel'
    } finally {
      creating.value = false
    }
  }

  return (
    <>
      <Button type="button" onClick={() => open.value = true}>Create channel</Button>
      <Popup
        open={open}
        eyebrow="CHANNELS"
        title="Create a channel"
        ariaDescription="Set up a new channel for focused conversations."
        size="large"
        class="channel-create-popup"
        onClose={close}
      >
        <form class="channel-form channel-create-form" onSubmit={create}>
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
          <div class="post-feed-error" role="alert">{error}</div>
        </form>
      </Popup>
    </>
  )
}

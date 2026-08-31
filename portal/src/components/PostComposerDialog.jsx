import { signal } from '../lib/vendor.js'
import { Button, Popup } from '../lib/vendor.js'
import { PostComposer } from './PostComposer.jsx'

export function PostComposerDialog({ onCreated, channelId = null }) {
  const open = signal(false)
  const isChannelPost = Boolean(channelId)

  function close() {
    open.value = false
  }

  function handleCreated(post) {
    close()
    onCreated?.(post)
  }

  return (
    <>
      <Button
        class="post-dialog-trigger"
        type="button"
        onClick={() => open.value = true}
      >
        {isChannelPost ? 'New channel post' : 'New post'}
      </Button>
      <Popup
        open={open}
        eyebrow={isChannelPost ? 'CHANNEL POST' : 'TIMELINE POST'}
        title={isChannelPost ? 'Post to channel' : 'Create a post'}
        ariaDescription={isChannelPost ? 'Write a post for this channel.' : 'Write a post for your timeline.'}
        size="large"
        class="post-composer-popup"
        onClose={close}
      >
        <PostComposer onCreated={handleCreated} channelId={channelId} />
      </Popup>
    </>
  )
}

import { computed, signal } from '../lib/vendor.js'
import { Badge, Button, Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

function formatPostTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function authorInitial(post) {
  return (post.author.displayName || post.author.username).slice(0, 1).toUpperCase()
}

export function PostCard({ post, router, currentUserId, onDeleted, onReply }) {
  const deleting = signal(false)
  const updatingLike = signal(false)
  const liked = signal(post.liked)
  const likeCount = signal(post.likeCount)
  const error = signal('')
  const isOwnPost = post.author.id === currentUserId
  const likeLabel = computed(() => `${likeCount.value} ${likeCount.value === 1 ? 'like' : 'likes'}`)

  async function toggleLike() {
    if (updatingLike.value) return
    error.value = ''
    updatingLike.value = true

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/likes`, {
        method: liked.value ? 'DELETE' : 'PUT'
      })
      liked.value = result.data.like.liked
      likeCount.value = result.data.like.likeCount
    } catch (requestError) {
      error.value = requestError.message || 'Could not update like'
    } finally {
      updatingLike.value = false
    }
  }

  async function deleteOwnPost() {
    if (deleting.value) return
    error.value = ''
    deleting.value = true

    try {
      await apiRequest(`/api/posts/${encodeURIComponent(post.id)}`, { method: 'DELETE' })
      onDeleted(post.id)
    } catch (requestError) {
      error.value = requestError.message || 'Could not delete post'
    } finally {
      deleting.value = false
    }
  }

  return (
    <Card class="post-card">
      <div class="post-card-header">
        <div class="post-author-avatar" aria-hidden="true">
          {post.author.avatarUrl
            ? <img src={post.author.avatarUrl} alt="" />
            : authorInitial(post)}
        </div>
        <a
          class="post-author-copy post-author-link"
          href={`/users/${post.author.username}`}
          onClick={router.link(`/users/${post.author.username}`)}
        >
          <Label size="large">{post.author.displayName}</Label>
          <span>@{post.author.username}</span>
        </a>
        <div class="post-card-meta">
          <time datetime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>{formatPostTime(post.createdAt)}</time>
          {post.following && <Badge tone="success">Following</Badge>}
        </div>
      </div>
      <p class="post-card-body">{post.body}</p>
      <div class="post-card-footer">
        <a class="post-card-action" href={`/posts/${post.id}`} onClick={router.link(`/posts/${post.id}`)}>
          <span aria-hidden="true">↩</span>
          <span>{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</span>
        </a>
        <Button
          variant="tertiary"
          size="small"
          class={computed(() => liked.value ? 'post-like-button post-like-button-active' : 'post-like-button')}
          pressed={liked}
          ariaLabel={computed(() => `${liked.value ? 'Unlike' : 'Like'} this post. ${likeLabel.value}`)}
          loading={updatingLike}
          onClick={toggleLike}
        >
          <span aria-hidden="true">{computed(() => liked.value ? '♥' : '♡')}</span>
          <span>{likeLabel}</span>
        </Button>
        {onReply && <Button variant="tertiary" size="small" onClick={() => onReply(post)}>Reply</Button>}
        {isOwnPost && <Button variant="tertiary" size="small" loading={deleting} onClick={deleteOwnPost}>Delete</Button>}
      </div>
      <div class="post-card-error" role="alert" aria-live="polite">{error}</div>
    </Card>
  )
}

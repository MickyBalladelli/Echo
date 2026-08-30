import { signal } from '../lib/vendor.js'
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

export function PostCard({ post, router, currentUserId, onDeleted }) {
  const deleting = signal(false)
  const error = signal('')
  const isOwnPost = post.author.id === currentUserId

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
        <div class="post-author-copy">
          <Label size="large">{post.author.displayName}</Label>
          <span>@{post.author.username}</span>
        </div>
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
        <span class="post-card-action" aria-label={`${post.likeCount} likes`}>
          <span aria-hidden="true">♡</span>
          <span>{post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</span>
        </span>
        {isOwnPost && <Button variant="tertiary" size="small" loading={deleting} onClick={deleteOwnPost}>Delete</Button>}
      </div>
      <div class="post-card-error" role="alert" aria-live="polite">{error}</div>
    </Card>
  )
}

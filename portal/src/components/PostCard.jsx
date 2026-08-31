import { computed, signal } from '../lib/vendor.js'
import { Badge, Button, Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { UserBadges } from './UserBadges.jsx'
import { ReportButton } from './ReportButton.jsx'
import { AppealButton } from './AppealButton.jsx'
import { LiveRegion } from './LiveRegion.jsx'
import { formatDateTime, formatRelativeTime } from '../lib/dates.js'

function authorInitial(post) {
  return (post.author.displayName || post.author.username).slice(0, 1).toUpperCase()
}

function renderBody(value, router) {
  return value.split(/(#[a-z0-9_]+|@[a-z0-9_]+)/gi).map((part, index) => {
    if (part.startsWith('#') && /^#[a-z0-9_]+$/i.test(part)) {
      const tag = part.slice(1).toLowerCase()
      return <a key={`${tag}-${index}`} class="post-hashtag" href={`/hashtags/${encodeURIComponent(tag)}`} onClick={router.link(`/hashtags/${encodeURIComponent(tag)}`)}>{part}</a>
    }
    if (part.startsWith('@') && /^@[a-z0-9_]+$/i.test(part)) {
      const username = part.slice(1).toLowerCase()
      return <a key={`${username}-${index}`} class="post-mention" href={`/users/${encodeURIComponent(username)}`} onClick={router.link(`/users/${encodeURIComponent(username)}`)}>{part}</a>
    }
    return part
  })
}

function renderRepostSource(source, router) {
  if (!source) return null
  return (
    <div class="post-repost-source">
      <div class="post-repost-source-heading">
        <span aria-hidden="true">↻</span>
        <a href={`/users/${source.author.username}`} onClick={router.link(`/users/${source.author.username}`)}>
          {source.author.displayName} @{source.author.username}
        </a>
      </div>
      <p>{renderBody(source.body || 'Repost', router)}</p>
      {source.imageUrl && <img class="post-media post-media-compact" src={source.imageUrl} alt={source.imageAltText || ''} loading="lazy" decoding="async" />}
    </div>
  )
}

export function PostCard({
  post,
  router,
  currentUserId,
  onDeleted,
  onReply,
  onReposted,
  onUpdated,
  onBookmarkChanged,
  onTogglePinned,
  pinned = false
}) {
  const deleting = signal(false)
  const updatingLike = signal(false)
  const updatingBookmark = signal(false)
  const reposting = signal(false)
  const pinning = signal(false)
  const editing = signal(false)
  const quoting = signal(false)
  const showContent = signal(!post.contentWarning)
  const showHistory = signal(false)
  const historyLoading = signal(false)
  const editHistory = signal([])
  const body = signal(post.body || '')
  const imageUrl = signal(post.imageUrl || '')
  const imageAltText = signal(post.imageAltText || '')
  const contentWarning = signal(post.contentWarning || '')
  const visibility = signal(post.visibility || 'public')
  const linkPreview = signal(post.linkPreview || null)
  const quoteBody = signal('')
  const liked = signal(post.liked)
  const likeCount = signal(post.likeCount)
  const bookmarked = signal(Boolean(post.bookmarked))
  const error = signal('')
  const announcement = signal('')
  const edited = signal(Boolean(post.isEdited || new Date(post.updatedAt).getTime() > new Date(post.createdAt).getTime() + 1000))
  const isOwnPost = post.author.id === currentUserId
  const canAppeal = isOwnPost && ['removed', 'appeal_rejected'].includes(post.contentStatus)
  const canEdit = isOwnPost && Date.now() - new Date(post.createdAt).getTime() <= 24 * 60 * 60 * 1000
  const likeLabel = computed(() => `${likeCount.value} ${likeCount.value === 1 ? 'like' : 'likes'}`)
  const isEdited = computed(() => edited.value)

  async function toggleLike() {
    if (updatingLike.value) return
    const previousLiked = liked.value
    const previousCount = likeCount.value
    const nextLiked = !previousLiked
    error.value = ''
    updatingLike.value = true
    liked.value = nextLiked
    likeCount.value = Math.max(0, previousCount + (nextLiked ? 1 : -1))
    announcement.value = nextLiked ? 'Post liked' : 'Like removed'

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/likes`, {
        method: nextLiked ? 'PUT' : 'DELETE'
      })
      liked.value = result.data.like.liked
      likeCount.value = result.data.like.likeCount
    } catch (requestError) {
      liked.value = previousLiked
      likeCount.value = previousCount
      announcement.value = 'Like change failed. Previous state restored.'
      error.value = requestError.message || 'Could not update like'
    } finally {
      updatingLike.value = false
    }
  }

  async function toggleBookmark() {
    if (updatingBookmark.value) return
    const previousBookmarked = bookmarked.value
    const nextBookmarked = !previousBookmarked
    error.value = ''
    updatingBookmark.value = true
    bookmarked.value = nextBookmarked
    announcement.value = nextBookmarked ? 'Post bookmarked' : 'Bookmark removed'

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/bookmark`, {
        method: nextBookmarked ? 'PUT' : 'DELETE'
      })
      bookmarked.value = result.data.bookmark.bookmarked
      onBookmarkChanged?.(result.data.bookmark)
    } catch (requestError) {
      bookmarked.value = previousBookmarked
      announcement.value = 'Bookmark change failed. Previous state restored.'
      error.value = requestError.message || 'Could not update bookmark'
    } finally {
      updatingBookmark.value = false
    }
  }

  async function repost(bodyValue = '') {
    if (reposting.value) return
    error.value = ''
    reposting.value = true

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/repost`, {
        method: 'POST',
        body: JSON.stringify({ body: bodyValue })
      })
      quoteBody.value = ''
      quoting.value = false
      onReposted?.(result.data.post)
    } catch (requestError) {
      error.value = requestError.message || 'Could not repost'
    } finally {
      reposting.value = false
    }
  }

  function submitQuote(event) {
    event.preventDefault()
    repost(quoteBody.value.trim())
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

  async function saveEdit(event) {
    event.preventDefault()
    if (!body.value.trim() && !post.repostOf) {
      error.value = 'Post text cannot be empty.'
      return
    }
    error.value = ''

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          body: body.value.trim(),
          visibility: visibility.value,
          imageUrl: imageUrl.value.trim() || null,
          imageAltText: imageAltText.value.trim() || null,
          contentWarning: contentWarning.value.trim() || null
        })
      })
      const updated = result.data.post
      body.value = updated.body || ''
      imageUrl.value = updated.imageUrl || ''
      imageAltText.value = updated.imageAltText || ''
      contentWarning.value = updated.contentWarning || ''
      visibility.value = updated.visibility
      linkPreview.value = updated.linkPreview || null
      edited.value = true
      editing.value = false
      showContent.value = !updated.contentWarning
      onUpdated?.(updated)
    } catch (requestError) {
      error.value = requestError.message || 'Could not edit post'
    }
  }

  async function loadHistory() {
    showHistory.value = !showHistory.value
    if (!showHistory.value || editHistory.value.length || historyLoading.value) return
    historyLoading.value = true
    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}/edits`)
      editHistory.value = result.data.edits
    } catch (requestError) {
      error.value = requestError.message || 'Could not load edit history'
    } finally {
      historyLoading.value = false
    }
  }

  async function togglePinned() {
    if (!onTogglePinned || pinning.value) return
    pinning.value = true
    error.value = ''
    try {
      await onTogglePinned(post)
    } catch (requestError) {
      error.value = requestError.message || 'Could not update pinned post'
    } finally {
      pinning.value = false
    }
  }

  const content = computed(() => showContent.value
    ? (
      <>
        {body.value && <p class="post-card-body">{renderBody(body.value, router)}</p>}
        {post.repostOf
          ? renderRepostSource(post.repostOf, router)
          : post.repostOfPostId && <div class="post-repost-source"><span>Original post unavailable.</span></div>}
        {imageUrl.value && <img class="post-media" src={imageUrl.value} alt={imageAltText.value || 'Image attached to post'} loading="lazy" decoding="async" />}
        {linkPreview.value && (
          <a class="post-link-preview" href={linkPreview.value.url} target="_blank" rel="noreferrer">
            <span>LINK PREVIEW</span>
            <strong>{linkPreview.value.label || linkPreview.value.hostname}</strong>
            <small>{linkPreview.value.url}</small>
          </a>
        )}
      </>
    )
    : (
      <div class="post-content-warning">
        <strong>Content warning</strong>
        <span>{contentWarning.value}</span>
        <Button variant="tertiary" size="small" onClick={() => showContent.value = true}>Show post</Button>
      </div>
    ))

  return (
    <div class="post-card-keyboard-item" role="group" tabIndex={0} data-keyboard-item="true" aria-label={`Post by ${post.author.displayName}`}>
      <Card class="post-card">
      <div class="post-card-header">
        <div class="post-author-avatar" aria-hidden="true">
          {post.author.avatarUrl
            ? <img src={post.author.avatarUrl} alt="" loading="lazy" decoding="async" />
            : authorInitial(post)}
        </div>
        <a
          class="post-author-copy post-author-link"
          href={`/users/${post.author.username}`}
          onClick={router.link(`/users/${post.author.username}`)}
        >
          <Label size="large">{post.author.displayName}</Label>
          <UserBadges badges={post.author.badges} />
          <span>@{post.author.username}</span>
        </a>
        <div class="post-card-meta">
          <time datetime={post.createdAt} title={formatDateTime(post.createdAt)}>{formatRelativeTime(post.createdAt)}</time>
          {isEdited && <span title="This post has been edited">edited</span>}
          {post.visibility !== 'public' && <Badge tone="accent">{post.visibility}</Badge>}
          {post.moderationStatus === 'pending' && <Badge tone="accent">Pending approval</Badge>}
          {post.moderationStatus === 'rejected' && <Badge tone="error">Rejected</Badge>}
          {post.contentStatus === 'flagged' && <Badge tone="accent">Flagged for review</Badge>}
          {post.contentStatus === 'removed' && <Badge tone="error">Removed by moderation</Badge>}
          {post.contentStatus === 'appeal_pending' && <Badge tone="accent">Appeal pending</Badge>}
          {post.contentStatus === 'appeal_accepted' && <Badge tone="success">Appeal accepted</Badge>}
          {post.contentStatus === 'appeal_rejected' && <Badge tone="error">Appeal rejected</Badge>}
          {post.following && <Badge tone="success">Following</Badge>}
        </div>
      </div>
      {editing.value
        ? (
          <form class="post-edit-form" onSubmit={saveEdit}>
            <textarea class="post-composer-input" use:bind={body} maxlength="280" rows="4" aria-label="Edit post text" />
            <div class="post-edit-options">
              <select use:bind={visibility} aria-label="Post visibility">
                <option value="public">Public</option>
                <option value="followers">Followers</option>
                <option value="private">Only me</option>
              </select>
              <input use:bind={contentWarning} maxlength="120" placeholder="Content warning (optional)" aria-label="Content warning" />
            </div>
            <div class="post-card-footer">
              <Button type="submit">Save edit</Button>
              <Button type="button" variant="tertiary" onClick={() => editing.value = false}>Cancel</Button>
            </div>
          </form>
        )
        : content}
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
        <Button
          variant="tertiary"
          size="small"
          pressed={bookmarked}
          loading={updatingBookmark}
          ariaLabel={computed(() => bookmarked.value ? 'Remove bookmark from this post' : 'Bookmark this post')}
          onClick={toggleBookmark}
        >
          {computed(() => bookmarked.value ? 'Bookmarked' : 'Bookmark')}
        </Button>
        <Button variant="tertiary" size="small" loading={reposting} onClick={() => repost()}>
          Repost
        </Button>
        <Button variant="tertiary" size="small" pressed={quoting} onClick={() => quoting.value = !quoting.value}>Quote</Button>
        {onReply && <Button variant="tertiary" size="small" onClick={() => onReply(post)}>Reply</Button>}
        {onTogglePinned && <Button variant="tertiary" size="small" loading={pinning} onClick={togglePinned}>{pinned ? 'Unpin' : 'Pin'}</Button>}
        {canEdit && <Button variant="tertiary" size="small" onClick={() => editing.value = true}>Edit</Button>}
        {isOwnPost && isEdited && <Button variant="tertiary" size="small" loading={historyLoading} onClick={loadHistory}>History</Button>}
        {isOwnPost && <Button variant="tertiary" size="small" loading={deleting} onClick={deleteOwnPost}>Delete</Button>}
        {!isOwnPost && <ReportButton targetType="post" targetId={post.id} />}
        {canAppeal && <AppealButton targetType="post" targetId={post.id} />}
      </div>
      {quoting.value && (
        <form class="post-quote-form" onSubmit={submitQuote}>
          <textarea use:bind={quoteBody} maxlength="280" rows="3" placeholder="Add your take (optional)" aria-label="Quote post text" />
          <Button type="submit" loading={reposting}>Quote post</Button>
        </form>
      )}
      {showHistory.value && (
        <div class="post-edit-history">
          <Label size="small" tone="accent">EDIT HISTORY</Label>
          {historyLoading.value
            ? <span role="status">Loading history…</span>
            : editHistory.value.length
              ? editHistory.value.map(edit => <div key={edit.id}><time datetime={edit.createdAt}>{formatDateTime(edit.createdAt)}</time><p>{edit.body || 'Repost'}</p></div>)
              : <span>No earlier versions.</span>}
        </div>
      )}
      <div class="post-card-error" role="alert" aria-live="polite">{error}</div>
        <LiveRegion message={announcement} />
      </Card>
    </div>
  )
}

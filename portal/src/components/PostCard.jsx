import { computed, signal } from '../lib/vendor.js'
import {
  Badge,
  Button,
  Card,
  ChatIcon,
  ClockIcon,
  FormField,
  IconButton,
  Label,
  MapPinIcon,
  Select,
  TextField
} from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { UserBadges } from './UserBadges.jsx'
import { ReportButton } from './ReportButton.jsx'
import { AppealButton } from './AppealButton.jsx'
import { LiveRegion } from './LiveRegion.jsx'
import { formatDateTime, formatRelativeTime } from '../lib/dates.js'
import { isGifMedia, mediaSrc, removeAttachedGifUrl } from '../lib/media.js'
import { Poll } from './Poll.jsx'
import { UserAvatar } from './UserAvatar.jsx'
import { ImmediateTooltip } from './ImmediateTooltip.jsx'
import { UserProfilePopover } from './UserProfilePopover.jsx'

function renderBody(value, router) {
  return value.split(/(#[a-z0-9_]+|@[a-z0-9_]+)/gi).map((part, index) => {
    if (part.startsWith('#') && /^#[a-z0-9_]+$/i.test(part)) {
      const tag = part.slice(1).toLowerCase()
      return <a key={`${tag}-${index}`} class="post-hashtag" href={`/hashtags/${encodeURIComponent(tag)}`} onClick={router.link(`/hashtags/${encodeURIComponent(tag)}`)}>{part}</a>
    }
    if (part.startsWith('@') && /^@[a-z0-9_]+$/i.test(part)) {
      const username = part.slice(1).toLowerCase()
      return <UserProfilePopover key={`${username}-${index}`} username={username} router={router} triggerClassName="post-mention">{part}</UserProfilePopover>
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
        <UserProfilePopover username={source.author.username} previewUser={source.author} router={router} triggerClassName="post-repost-source-author">
          {source.author.displayName} @{source.author.username}
        </UserProfilePopover>
      </div>
      <p>{renderBody(source.body || 'Repost', router)}</p>
      {source.imageUrl && <img class={isGifMedia(source.imageUrl) ? 'post-media post-media-compact post-media-gif' : 'post-media post-media-compact'} src={mediaSrc(source.imageUrl)} alt={source.imageAltText || ''} loading="lazy" decoding="async" />}
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
  const visibleBody = computed(() => removeAttachedGifUrl(body.value, imageUrl.value))
  const hasAttachedGifBody = computed(() => isGifMedia(imageUrl.value) && body.value.includes(imageUrl.value))

  function openReply() {
    if (onReply) {
      onReply(post)
      return
    }
    router.navigate(`/posts/${post.id}?reply=1`)
  }

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
    const nextBody = removeAttachedGifUrl(body.value, imageUrl.value)
    if (!nextBody && !post.repostOf && !imageUrl.value) {
      error.value = 'Post text cannot be empty.'
      return
    }
    error.value = ''

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          body: nextBody,
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
        {visibleBody.value && <p class="post-card-body">{renderBody(visibleBody.value, router)}</p>}
        {post.repostOf
          ? renderRepostSource(post.repostOf, router)
          : post.repostOfPostId && <div class="post-repost-source"><span>Original post unavailable.</span></div>}
        {imageUrl.value && <img class={isGifMedia(imageUrl.value) ? 'post-media post-media-gif' : 'post-media'} src={mediaSrc(imageUrl.value)} alt={imageAltText.value || 'Image attached to post'} loading="lazy" decoding="async" />}
        {linkPreview.value && !hasAttachedGifBody.value && (
          <a class="post-link-preview" href={linkPreview.value.url} target="_blank" rel="noreferrer">
            <span>LINK PREVIEW</span>
            <strong>{linkPreview.value.label || linkPreview.value.hostname}</strong>
            <small>{linkPreview.value.url}</small>
          </a>
        )}
        {post.poll && <Poll postId={post.id} poll={post.poll} />}
      </>
    )
    : (
      <div class="post-content-warning">
        <strong>Content warning</strong>
        <span>{contentWarning.value}</span>
        <Button variant="tertiary" size="small" onClick={() => showContent.value = true}>Show post</Button>
      </div>
    ))

  const mainContent = computed(() => editing.value ? (
    <form class="post-edit-form" onSubmit={saveEdit}>
      <textarea class="post-composer-input" use:bind={body} maxlength="280" rows="4" aria-label="Edit post text" />
      <div class="post-edit-options">
        <FormField id={`post-edit-visibility-${post.id}`} label="Visibility">
          <Select
            id={`post-edit-visibility-${post.id}`}
            value={visibility}
            ariaLabel="Post visibility"
            options={[
              { value: 'public', label: 'Public' },
              { value: 'followers', label: 'Followers' },
              { value: 'private', label: 'Only me' }
            ]}
          />
        </FormField>
        <FormField id={`post-edit-warning-${post.id}`} label="Content warning">
          <TextField
            id={`post-edit-warning-${post.id}`}
            value={contentWarning}
            maxLength={120}
            placeholder="Optional"
            ariaLabel="Content warning"
          />
        </FormField>
      </div>
      <div class="post-card-footer">
        <Button type="submit">Save edit</Button>
        <Button type="button" variant="tertiary" onClick={() => editing.value = false}>Cancel</Button>
      </div>
    </form>
  ) : content.value)

  const quotePanel = computed(() => quoting.value ? (
    <form class="post-quote-form" onSubmit={submitQuote}>
      <textarea use:bind={quoteBody} maxlength="280" rows="3" placeholder="Add your take (optional)" aria-label="Quote post text" />
      <Button type="submit" loading={reposting}>Quote post</Button>
    </form>
  ) : null)

  const historyPanel = computed(() => {
    if (!showHistory.value) return null
    if (historyLoading.value) {
      return (
        <div class="post-edit-history">
          <Label size="small" tone="accent">EDIT HISTORY</Label>
          <span role="status">Loading history…</span>
        </div>
      )
    }
    if (!editHistory.value.length) {
      return (
        <div class="post-edit-history">
          <Label size="small" tone="accent">EDIT HISTORY</Label>
          <span>No earlier versions.</span>
        </div>
      )
    }
    return (
      <div class="post-edit-history">
        <Label size="small" tone="accent">EDIT HISTORY</Label>
        {editHistory.value.map(edit => <div key={edit.id}><time datetime={edit.createdAt}>{formatDateTime(edit.createdAt)}</time><p>{edit.body || 'Repost'}</p></div>)}
      </div>
    )
  })

  const historyButton = computed(() => isOwnPost && isEdited.value
    ? <IconButton icon={ClockIcon()} ariaLabel="View edit history" title="History" loading={historyLoading} onClick={loadHistory} />
    : null)

  return (
    <div class="post-card-keyboard-item" role="group" tabIndex={0} data-keyboard-item="true" aria-label={`Post by ${post.author.displayName}`}>
      <Card class="post-card">
      <div class="post-card-header">
        <UserAvatar user={post.author} size="medium" className="post-author-avatar" />
        <UserProfilePopover
          username={post.author.username}
          previewUser={post.author}
          router={router}
          wrapperClassName="post-author-popover-anchor"
          triggerClassName="post-author-copy post-author-link"
        >
          <Label size="large">{post.author.displayName}</Label>
          <UserBadges badges={post.author.badges} />
          <span>@{post.author.username}</span>
        </UserProfilePopover>
        <div class="post-card-meta">
          <time datetime={post.createdAt} title={formatDateTime(post.createdAt)}>{formatRelativeTime(post.createdAt)}</time>
          {computed(() => isEdited.value ? <span title="This post has been edited">edited</span> : null)}
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
      {mainContent}
      <div class="post-card-footer">
        <IconButton
          class="post-card-action-button"
          icon={ChatIcon()}
          ariaLabel={`Reply to this post. ${post.replyCount} ${post.replyCount === 1 ? 'reply' : 'replies'}`}
          title="Reply"
          onClick={openReply}
        />
        <span class="post-action-with-count">
          <IconButton
            class={computed(() => liked.value ? 'post-like-button post-like-button-active' : 'post-like-button')}
            icon={computed(() => liked.value ? '♥' : '♡')}
            pressed={liked}
            ariaLabel={computed(() => `${liked.value ? 'Unlike' : 'Like'} this post. ${likeLabel.value}`)}
            title={computed(() => `${liked.value ? 'Unlike' : 'Like'} post (${likeCount.value})`)}
            loading={updatingLike}
            onClick={toggleLike}
          />
          <Badge class="post-action-count" size="small" pulseOnChange ariaLabel={computed(() => `${likeCount.value} likes`)}>
            {likeCount}
          </Badge>
        </span>
        {ImmediateTooltip({
          content: 'Repost',
          delay: 0,
          children: (
            <IconButton
              class="post-card-inline-action"
              icon="↻"
              ariaLabel="Repost"
              loading={reposting}
              onClick={() => repost()}
            />
          )
        })}
        {ImmediateTooltip({
          content: 'Quote post',
          delay: 0,
          children: (
            <IconButton
              class="post-card-inline-action"
              icon="“"
              ariaLabel="Quote post"
              pressed={quoting}
              onClick={() => quoting.value = !quoting.value}
            />
          )
        })}
        {ImmediateTooltip({
          content: computed(() => bookmarked.value ? 'Remove bookmark' : 'Bookmark'),
          delay: 0,
          children: (
            <IconButton
              class="post-card-inline-action"
              icon="🔖"
              ariaLabel={computed(() => bookmarked.value ? 'Remove bookmark' : 'Bookmark')}
              pressed={bookmarked}
              onClick={toggleBookmark}
            />
          )
        })}
        {onTogglePinned && <IconButton icon={MapPinIcon()} ariaLabel={pinned ? 'Unpin this post' : 'Pin this post'} title={pinned ? 'Unpin' : 'Pin'} loading={pinning} pressed={pinned} onClick={togglePinned} />}
        {canEdit && <IconButton icon="✎" ariaLabel="Edit this post" title="Edit" onClick={() => editing.value = true} />}
        {historyButton}
        {isOwnPost && <IconButton icon="×" ariaLabel="Delete this post" title="Delete" loading={deleting} onClick={deleteOwnPost} />}
        {!isOwnPost && <ReportButton targetType="post" targetId={post.id} />}
        {canAppeal && <AppealButton targetType="post" targetId={post.id} />}
      </div>
      {quotePanel}
      {historyPanel}
      <div class="post-card-error" role="alert" aria-live="polite">{error}</div>
        <LiveRegion message={announcement} />
      </Card>
    </div>
  )
}

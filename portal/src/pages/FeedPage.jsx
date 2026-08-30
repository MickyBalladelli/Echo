import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from '../components/PostCard.jsx'
import { PostComposer } from '../components/PostComposer.jsx'
import { ReplyComposer } from '../components/ReplyComposer.jsx'
import { PageFrame } from './PageFrame.jsx'

function getRequestMessage(error) {
  return error?.message || 'Could not load posts'
}

export function FeedPage({ router, currentUserId, feed = 'home' }) {
  const posts = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const loadingMore = signal(false)

  async function loadFeed({ append = false } = {}) {
    if (append) {
      if (loadingMore.value || !nextCursor.value) return
      loadingMore.value = true
    } else {
      state.value = 'loading'
      error.value = ''
    }

    try {
      const query = new URLSearchParams({ limit: '20', feed })
      if (append && nextCursor.value) query.set('cursor', nextCursor.value)
      const result = await apiRequest(`/api/posts?${query.toString()}`)
      const received = result.data || []
      posts.value = append ? [...posts.value, ...received] : received
      nextCursor.value = result.meta?.nextCursor || null
      state.value = 'ready'
    } catch (requestError) {
      if (append) {
        error.value = getRequestMessage(requestError)
      } else {
        state.value = 'error'
        error.value = getRequestMessage(requestError)
      }
    } finally {
      loadingMore.value = false
    }
  }

  function addPost(post) {
    posts.value = [post, ...posts.value.filter(existing => existing.id !== post.id)]
    state.value = 'ready'
  }

  function removePost(postId) {
    posts.value = posts.value.filter(post => post.id !== postId)
  }

  const feedContent = computed(() => {
    if (state.value === 'loading') {
      return <Card class="route-card feed-status-card"><div role="status">Loading posts…</div></Card>
    }

    if (state.value === 'error') {
      return (
        <Card class="route-card feed-status-card">
          <EmptyState
            status="error"
            title="Feed unavailable"
            description={error.value}
            action={Button({ children: 'Try again', onClick: () => loadFeed() })}
          />
        </Card>
      )
    }

    if (!posts.value.length) {
      return (
        <Card class="route-card feed-status-card">
          <EmptyState
            title={feed === 'following' ? 'Nothing from your circle yet' : 'Your feed is quiet'}
            description={feed === 'following' ? 'Follow people to see their posts here.' : 'Write the first signal and start the conversation.'}
          />
        </Card>
      )
    }

    return (
      <div class="post-feed">
        {posts.value.map(post => (
          <PostCard
            key={post.id}
            post={post}
            router={router}
            currentUserId={currentUserId}
            onDeleted={removePost}
          />
        ))}
        {nextCursor.value && (
          <div class="feed-load-more">
            <Button variant="secondary" loading={loadingMore} onClick={() => loadFeed({ append: true })}>Load more</Button>
          </div>
        )}
        {error.value && <div class="post-feed-error" role="alert">{error}</div>}
      </div>
    )
  })

  onMount(() => loadFeed())

  return (
    <PageFrame
      eyebrow={feed === 'following' ? 'HOME / FOLLOWING' : 'HOME / DISCOVERY'}
      title={feed === 'following' ? 'Following' : 'Home'}
      description={feed === 'following'
        ? 'Posts from you and people you follow.'
        : 'A mixed discovery feed of public posts.'}
    >
      <PostComposer onCreated={addPost} />
      {feedContent}
    </PageFrame>
  )
}

export function PostDetailPage({ id, router, currentUserId }) {
  const post = signal(null)
  const replyTarget = signal(null)
  const state = signal('loading')
  const error = signal('')

  async function loadPost() {
    state.value = 'loading'
    error.value = ''

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(id)}`)
      post.value = result.data.post
      replyTarget.value = post.value
      state.value = 'ready'
    } catch (requestError) {
      error.value = getRequestMessage(requestError)
      state.value = 'error'
    }
  }

  function handleDeleted() {
    router.navigate('/')
  }

  function sortReplies(replies) {
    return [...replies].sort((left, right) => {
      const timeDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      return timeDifference || left.id.localeCompare(right.id)
    })
  }

  function selectReplyTarget(target) {
    replyTarget.value = target
  }

  function resetReplyTarget() {
    replyTarget.value = post.value
  }

  function addReply(reply) {
    const target = replyTarget.value
    const nextReply = {
      ...reply,
      depth: reply.depth || (target?.depth || 0) + 1
    }
    const nextPost = {
      ...post.value,
      replyCount: post.value.replyCount + 1,
      replies: sortReplies([...post.value.replies, nextReply])
    }

    post.value = nextPost
    replyTarget.value = nextPost
  }

  const detailContent = computed(() => {
    if (state.value === 'loading') {
      return <Card class="route-card feed-status-card"><div role="status">Loading post…</div></Card>
    }

    if (state.value === 'error') {
      return (
        <Card class="route-card feed-status-card">
          <EmptyState
            status="error"
            title="Post unavailable"
            description={error.value}
            action={Button({ children: 'Back home', onClick: () => router.navigate('/') })}
          />
        </Card>
      )
    }

    return (
      <div class="post-detail-stack">
        <PostCard
          post={post.value}
          router={router}
          currentUserId={currentUserId}
          onDeleted={handleDeleted}
          onReply={selectReplyTarget}
        />
        <ReplyComposer replyTarget={replyTarget} onCreated={addReply} onCancel={resetReplyTarget} />
        <div class="post-replies-heading">
          <Label size="small" tone="accent">REPLIES</Label>
          <span>{post.value.replies.length ? `${post.value.replies.length} in this thread` : 'No replies yet'}</span>
        </div>
        {post.value.replies.length > 0 && (
          <div class="post-feed">
            {post.value.replies.map(reply => (
              <div key={reply.id} class={`post-reply post-reply-depth-${Math.min(reply.depth || 1, 3)}`}>
                <PostCard
                  post={reply}
                  router={router}
                  currentUserId={currentUserId}
                  onDeleted={loadPost}
                  onReply={selectReplyTarget}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  })

  onMount(() => loadPost())

  return (
    <PageFrame
      eyebrow="THREAD / POST"
      title="Post"
      description="Read the full signal and follow its replies."
    >
      <a class="back-link" href="/" onClick={router.link('/')}>← Back to home</a>
      {detailContent}
    </PageFrame>
  )
}

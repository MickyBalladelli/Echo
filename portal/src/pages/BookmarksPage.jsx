import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from '../components/PostCard.jsx'
import { KeyboardList } from '../components/KeyboardList.jsx'
import { VirtualList } from '../components/VirtualList.jsx'
import { PageFrame } from './PageFrame.jsx'

export function BookmarksPage({ router, currentUserId }) {
  const posts = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const loadingMore = signal(false)
  const error = signal('')

  async function load({ append = false } = {}) {
    if (append) {
      if (loadingMore.value || !nextCursor.value) return
      loadingMore.value = true
    } else {
      state.value = 'loading'
      error.value = ''
    }

    try {
      const query = new URLSearchParams({ limit: '30' })
      if (append && nextCursor.value) query.set('cursor', nextCursor.value)
      const result = await apiRequest(`/api/me/bookmarks?${query.toString()}`)
      posts.value = append ? [...posts.value, ...result.data] : result.data
      nextCursor.value = result.meta?.nextCursor || null
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load bookmarks'
      state.value = append ? 'ready' : 'error'
    } finally {
      loadingMore.value = false
    }
  }

  function removePost(postId) {
    posts.value = posts.value.filter(post => post.id !== postId)
  }

  function updatePost(updatedPost) {
    posts.value = posts.value.map(post => post.id === updatedPost.id ? { ...post, ...updatedPost } : post)
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading bookmarks…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Bookmarks unavailable" description={error.value} action={Button({ children: 'Try again', onClick: load })} /></Card>
    if (!posts.value.length) return <Card><EmptyState title="No bookmarks yet" description="Save posts you want to find again." /></Card>
    return (
      <div class="post-feed">
        <KeyboardList label="Bookmarked posts" className="post-feed-keyboard">
          <VirtualList
            items={posts}
            estimateSize={360}
            label="Bookmarked posts"
            renderItem={post => <PostCard post={post} router={router} currentUserId={currentUserId} onDeleted={removePost} onUpdated={updatePost} onReposted={newPost => posts.value = [newPost, ...posts.value]} onBookmarkChanged={bookmark => !bookmark.bookmarked && removePost(post.id)} />}
          />
        </KeyboardList>
        {nextCursor.value && <div class="feed-load-more"><Button variant="secondary" loading={loadingMore} onClick={() => load({ append: true })}>Load more</Button></div>}
        {error.value && <div class="post-feed-error" role="alert">{error}</div>}
      </div>
    )
  })

  onMount(load)

  return <PageFrame eyebrow="KEEP / BOOKMARKS" title="Bookmarks" description="Saved posts, ready when you are." hideHeader>{content}</PageFrame>
}

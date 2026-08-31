import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from '../components/PostCard.jsx'
import { PageFrame } from './PageFrame.jsx'

export function HashtagPage({ tag, router, currentUserId }) {
  const posts = signal([])
  const state = signal('loading')
  const error = signal('')
  const cleanTag = tag.replace(/^#/, '').toLowerCase()

  async function load() {
    state.value = 'loading'
    error.value = ''
    try {
      const query = new URLSearchParams({ hashtag: cleanTag, limit: '50' })
      const result = await apiRequest(`/api/posts?${query.toString()}`)
      posts.value = result.data
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load hashtag'
      state.value = 'error'
    }
  }

  function removePost(postId) {
    posts.value = posts.value.filter(post => post.id !== postId)
  }

  function updatePost(updatedPost) {
    posts.value = posts.value.map(post => post.id === updatedPost.id ? { ...post, ...updatedPost } : post)
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading #{cleanTag}…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Hashtag unavailable" description={error.value} action={Button({ children: 'Try again', onClick: load })} /></Card>
    if (!posts.value.length) return <Card><EmptyState title={`No posts for #${cleanTag}`} description="Use this hashtag in a post to start the topic." /></Card>
    return <div class="post-feed">{posts.value.map(post => <PostCard key={post.id} post={post} router={router} currentUserId={currentUserId} onDeleted={removePost} onUpdated={updatePost} onReposted={newPost => posts.value = [newPost, ...posts.value]} />)}</div>
  })

  onMount(load)

  return (
    <PageFrame eyebrow="DISCOVER / HASHTAG" title={`#${cleanTag}`} description={`Public posts tagged with #${cleanTag}.`}>
      <a class="back-link" href="/explore" onClick={router.link('/explore')}>← Explore</a>
      {content}
    </PageFrame>
  )
}

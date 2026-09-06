import { Card, computed, effect, Label, onMount, signal, TreeView } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { formatRelativeTime, sortByCreatedAt } from '../lib/dates.js'

function getPostSnippet(post) {
  const body = String(post.body || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (body) return body.length > 52 ? `${body.slice(0, 52)}…` : body
  if (post.imageUrl) return 'Media post'
  return 'Post'
}

function buildOverviewItems(posts, router, selectedPostId) {
  const nodes = posts.map(post => ({ post, children: [] }))
  const byId = new Map(nodes.map(node => [node.post.id, node]))
  const roots = []

  for (const node of nodes) {
    const parent = byId.get(node.post.parentPostId)
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const compareNodes = (left, right) => {
    const leftTime = new Date(left.post.createdAt).getTime() || 0
    const rightTime = new Date(right.post.createdAt).getTime() || 0
    return rightTime - leftTime || String(right.post.id).localeCompare(String(left.post.id))
  }

  const toItem = node => {
    const post = node.post
    const username = post.author?.username || post.author?.displayName || 'unknown'
    const routePostId = router.path.value.startsWith('/posts/')
      ? router.path.value.slice('/posts/'.length)
      : ''
    const activePostId = selectedPostId?.value || routePostId
    const item = {
      id: post.id,
      label: `@${username} · ${getPostSnippet(post)}`,
      meta: formatRelativeTime(post.createdAt),
      expanded: true,
      active: activePostId === post.id,
      onClick: node.children.length > 0
        ? event => {
          if (event.target?.closest?.('.prism-tree-label')) {
            if (selectedPostId) selectedPostId.value = post.id
            router.navigate(`/posts/${post.id}`)
          }
        }
        : () => {
          if (selectedPostId) selectedPostId.value = post.id
          router.navigate(`/posts/${post.id}`)
        }
    }

    if (node.children.length > 0) {
      item.children = node.children
        .sort(compareNodes)
        .map(toItem)
    }

    return item
  }

  return roots.sort(compareNodes).map(toItem)
}

export function PostOverview({ router, refreshVersion, selectedPostId }) {
  const posts = signal([])
  const state = signal('loading')
  const error = signal('')
  let activeFeed = 'home'
  let loadedFeed = ''
  let lastRefreshVersion = refreshVersion?.value ?? 0
  let requestId = 0
  let active = true

  async function load(feed = activeFeed) {
    const currentRequestId = ++requestId
    state.value = 'loading'
    error.value = ''

    try {
      const query = new URLSearchParams({ limit: '100', feed })
      const result = await apiRequest(`/api/posts?${query.toString()}`)
      if (!active || currentRequestId !== requestId) return
      posts.value = sortByCreatedAt(result.data || [])
      state.value = 'ready'
    } catch (requestError) {
      if (!active || currentRequestId !== requestId) return
      error.value = requestError.message || 'Could not load posts'
      state.value = 'error'
    }
  }

  const treeItems = computed(() => {
    if (state.value === 'loading') return [{ id: 'post-map-loading', label: 'Loading posts…' }]
    if (state.value === 'error') return [{ id: 'post-map-error', label: 'Try again', onClick: () => load() }]
    if (!posts.value.length) return [{ id: 'post-map-empty', label: 'No posts yet' }]
    return buildOverviewItems(posts.value, router, selectedPostId)
  })

  const tree = TreeView({
    id: 'echo-post-overview',
    ariaLabel: 'Post map',
    items: treeItems,
    model: 'nocturne',
    itemVariant: 'minimal',
    expandCollapse: true,
    expandAllLabel: 'Expand all',
    collapseAllLabel: 'Collapse all'
  })

  onMount(() => {
    const syncFeed = () => {
      const nextFeed = router?.path?.value === '/following' ? 'following' : 'home'
      const nextRefreshVersion = refreshVersion?.value ?? 0

      if (nextFeed !== loadedFeed) {
        activeFeed = nextFeed
        loadedFeed = nextFeed
        lastRefreshVersion = nextRefreshVersion
        load(nextFeed)
        return
      }

      if (nextRefreshVersion !== lastRefreshVersion) {
        lastRefreshVersion = nextRefreshVersion
        load(nextFeed)
      }
    }

    const stopFeedEffect = effect(syncFeed)
    const stopSelectionEffect = selectedPostId
      ? effect(() => {
        router?.path?.value
        selectedPostId.value = null
      })
      : null
    return () => {
      active = false
      requestId += 1
      stopFeedEffect?.()
      stopSelectionEffect?.()
    }
  })

  return (
    <Card class="context-card post-overview-card">
      <div class="post-overview-heading">
        <Label size="small" tone="accent">POST MAP</Label>
        <h2>Timeline</h2>
        <p>Jump through posts and replies.</p>
        {computed(() => state.value === 'error' ? <span class="post-overview-error" role="alert">{error.value}</span> : null)}
      </div>
      <div class="post-overview-tree">{tree}</div>
    </Card>
  )
}

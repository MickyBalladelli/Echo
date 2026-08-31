import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, FormField, Label, Tabs, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from './PostCard.jsx'
import { SuggestedUsers } from './SuggestedUsers.jsx'
import { UserBadges } from './UserBadges.jsx'

const searchTypes = Object.freeze([
  { id: 'users', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'channels', label: 'Channels' },
  { id: 'hashtags', label: 'Hashtags' }
])

function userInitial(user) {
  return (user.profile.displayName || user.username).slice(0, 1).toUpperCase()
}

export function ExploreContent({ router, currentUserId }) {
  const recentPosts = signal([])
  const popularPosts = signal([])
  const exploreState = signal('loading')
  const query = signal('')
  const submittedQuery = signal('')
  const searchType = signal('users')
  const results = signal([])
  const nextCursor = signal(null)
  const searchState = signal('idle')
  const searchError = signal('')
  const loadingMore = signal(false)

  async function loadExplore() {
    exploreState.value = 'loading'
    try {
      const [recent, popular] = await Promise.all([
        apiRequest('/api/search/explore/posts?sort=recent&limit=12'),
        apiRequest('/api/search/explore/posts?sort=popular&limit=12')
      ])
      recentPosts.value = recent.data
      popularPosts.value = popular.data
      exploreState.value = 'ready'
    } catch {
      exploreState.value = 'error'
    }
  }

  async function runSearch({ append = false, type = searchType.value } = {}) {
    const cleanQuery = submittedQuery.value || query.value.trim()
    if (cleanQuery.length < 2) {
      searchError.value = 'Use at least 2 characters.'
      return
    }

    if (append) loadingMore.value = true
    else searchState.value = 'loading'
    searchError.value = ''
    submittedQuery.value = cleanQuery

    try {
      const parameters = new URLSearchParams({ q: cleanQuery, type, limit: '12' })
      if (append && nextCursor.value) parameters.set('cursor', nextCursor.value)
      const response = await apiRequest(`/api/search?${parameters.toString()}`)
      results.value = append ? [...results.value, ...response.data] : response.data
      nextCursor.value = response.meta?.nextCursor || null
      searchState.value = 'ready'
    } catch (requestError) {
      searchError.value = requestError.message || 'Search failed'
      searchState.value = 'error'
    } finally {
      loadingMore.value = false
    }
  }

  function submit(event) {
    event.preventDefault()
    submittedQuery.value = query.value.trim()
    runSearch()
  }

  function changeType(type) {
    if (searchType.value === type) return
    searchType.value = type
    results.value = []
    nextCursor.value = null
    if (submittedQuery.value) runSearch({ type })
  }

  function removePost(postId) {
    recentPosts.value = recentPosts.value.filter(post => post.id !== postId)
    popularPosts.value = popularPosts.value.filter(post => post.id !== postId)
    results.value = results.value.filter(item => item.id !== postId)
  }

  function updatePost(updatedPost) {
    const update = items => items.map(item => item.id === updatedPost.id ? { ...item, ...updatedPost } : item)
    recentPosts.value = update(recentPosts.value)
    popularPosts.value = update(popularPosts.value)
    results.value = update(results.value)
  }

  function addPost(post) {
    recentPosts.value = [post, ...recentPosts.value.filter(item => item.id !== post.id)]
  }

  function renderPosts(posts, emptyTitle) {
    if (!posts.length) return <Card><EmptyState title={emptyTitle} /></Card>
    return (
      <div class="post-feed">
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            router={router}
            currentUserId={currentUserId}
            onDeleted={removePost}
            onUpdated={updatePost}
            onReposted={addPost}
          />
        ))}
      </div>
    )
  }

  function renderSearchResults() {
    if (searchState.value === 'idle') {
      return <Card><EmptyState title="Search Echo" description="Find people, words in posts, or channels." /></Card>
    }
    if (searchState.value === 'loading') return <Card><div role="status">Searching…</div></Card>
    if (searchState.value === 'error') {
      return <Card><EmptyState status="error" title="Search failed" description={searchError.value} /></Card>
    }
    if (!results.value.length) {
      return <Card><EmptyState title="No matches" description={`Nothing found for “${submittedQuery.value}”.`} /></Card>
    }
    if (searchType.value === 'posts') return renderPosts(results.value, 'No posts found')
    if (searchType.value === 'hashtags') {
      return (
        <div class="search-result-grid">
          {results.value.map(item => (
            <Card key={item.id} class="search-result-card hashtag-search-card">
              <div>
                <Label size="large">#{item.tag}</Label>
                <p>{item.postCount} {item.postCount === 1 ? 'post' : 'posts'}</p>
              </div>
              <a class="back-link" href={`/hashtags/${encodeURIComponent(item.tag)}`} onClick={router.link(`/hashtags/${encodeURIComponent(item.tag)}`)}>View hashtag →</a>
            </Card>
          ))}
        </div>
      )
    }

    return (
      <div class="search-result-grid">
        {results.value.map(item => searchType.value === 'users'
          ? (
            <Card key={item.id} class="search-result-card">
              {item.profile.avatarUrl
                ? <img class="social-user-avatar" src={item.profile.avatarUrl} alt="" loading="lazy" />
                : <span class="social-user-avatar" aria-hidden="true">{userInitial(item)}</span>}
              <div>
                <Label size="large">{item.profile.displayName}</Label>
                <UserBadges badges={item.badges} />
                <p class="search-result-handle">@{item.username}</p>
                <p>{item.profile.bio || 'No bio yet.'}</p>
                {item.mutualCount > 0 && <p class="search-result-mutual">{item.mutualCount} mutual follows</p>}
              </div>
              <a class="back-link" href={`/users/${item.username}`} onClick={router.link(`/users/${item.username}`)}>View profile →</a>
            </Card>
          )
          : (
            <Card key={item.id} class="search-result-card channel-search-card">
              <div>
                <Label size="large">{item.name}</Label>
                <p class="search-result-handle">/{item.slug}</p>
                <p>{item.description || 'No description yet.'}</p>
              </div>
              <span>{item.memberCount} members · {item.postCount} posts</span>
              <a class="back-link" href={`/channels/${item.slug}`} onClick={router.link(`/channels/${item.slug}`)}>View channel →</a>
            </Card>
          ))}
      </div>
    )
  }

  const exploreTabs = computed(() => [
    {
      id: 'recent',
      label: 'Recent',
      content: computed(() => exploreState.value === 'loading'
        ? <Card><div role="status">Loading recent posts…</div></Card>
        : exploreState.value === 'error'
          ? <Card><EmptyState status="error" title="Could not load posts" /></Card>
          : renderPosts(recentPosts.value, 'No recent posts'))
    },
    {
      id: 'popular',
      label: 'Popular',
      content: computed(() => exploreState.value === 'loading'
        ? <Card><div role="status">Loading popular posts…</div></Card>
        : exploreState.value === 'error'
          ? <Card><EmptyState status="error" title="Could not load posts" /></Card>
          : renderPosts(popularPosts.value, 'No popular posts'))
    }
  ])
  const searchContent = computed(renderSearchResults)
  const searchErrorBanner = computed(() => searchError.value && searchState.value !== 'error'
    ? <div class="post-feed-error" role="alert">{searchError.value}</div>
    : null)
  const searchPagination = computed(() => nextCursor.value
    ? (
      <div class="feed-load-more">
        <Button variant="secondary" loading={loadingMore} onClick={() => runSearch({ append: true })}>Load more results</Button>
      </div>
    )
    : null)

  onMount(() => loadExplore())

  return (
    <div class="explore-stack">
      <SuggestedUsers router={router} />
      <Card class="explore-search-card">
        <form class="explore-search-form" onSubmit={submit}>
          <FormField id="explore-search" label="Search">
            <TextField
              id="explore-search"
              value={query}
              placeholder="People, posts, or channels"
              maxLength={100}
            />
          </FormField>
          <Button type="submit">Search</Button>
        </form>
        <div class="search-type-buttons" aria-label="Search type">
          {searchTypes.map(type => (
            <Button
              key={type.id}
              variant={computed(() => searchType.value === type.id ? 'secondary' : 'tertiary')}
              size="small"
              pressed={computed(() => searchType.value === type.id)}
              onClick={() => changeType(type.id)}
            >
              {type.label}
            </Button>
          ))}
        </div>
        {searchErrorBanner}
      </Card>
      {searchContent}
      {searchPagination}
      <div class="explore-posts-heading">
        <Label size="small" tone="accent">DISCOVER POSTS</Label>
      </div>
      <Tabs items={exploreTabs} ariaLabel="Explore posts" />
    </div>
  )
}

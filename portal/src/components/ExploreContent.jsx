import { computed, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PostCard } from './PostCard.jsx'
import { UserBadges } from './UserBadges.jsx'
import { UserAvatar } from './UserAvatar.jsx'
import { KeyboardList } from './KeyboardList.jsx'
import { VirtualList } from './VirtualList.jsx'

const searchTypes = Object.freeze([
  { id: 'users', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'channels', label: 'Channels' },
  { id: 'hashtags', label: 'Hashtags' }
])

export function ExploreContent({ router, currentUserId }) {
  const query = signal('')
  const submittedQuery = signal('')
  const searchType = signal('users')
  const results = signal([])
  const nextCursor = signal(null)
  const searchState = signal('idle')
  const searchError = signal('')
  const loadingMore = signal(false)
  let searchRequestId = 0

  async function runSearch({ append = false, type = searchType.value } = {}) {
    const cleanQuery = submittedQuery.value || query.value.trim()
    if (cleanQuery.length < 2) {
      searchError.value = 'Use at least 2 characters.'
      return
    }

    const requestId = ++searchRequestId
    if (append) loadingMore.value = true
    else {
      searchState.value = 'loading'
      results.value = []
      nextCursor.value = null
      loadingMore.value = false
    }
    searchError.value = ''
    submittedQuery.value = cleanQuery

    try {
      const parameters = new URLSearchParams({ q: cleanQuery, type, limit: '12' })
      if (append && nextCursor.value) parameters.set('cursor', nextCursor.value)
      const response = await apiRequest(`/api/search?${parameters.toString()}`)
      if (requestId !== searchRequestId) return
      results.value = append ? [...results.value, ...response.data] : response.data
      nextCursor.value = response.meta?.nextCursor || null
      searchState.value = 'ready'
    } catch (requestError) {
      if (requestId !== searchRequestId) return
      searchError.value = requestError.message || 'Search failed'
      searchState.value = 'error'
    } finally {
      if (requestId === searchRequestId) loadingMore.value = false
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
    results.value = results.value.filter(item => item.id !== postId)
  }

  function updatePost(updatedPost) {
    results.value = results.value.map(item => item.id === updatedPost.id ? { ...item, ...updatedPost } : item)
  }

  function renderPosts(posts, emptyTitle) {
    const postItems = Array.isArray(posts) ? posts : posts.value || []
    if (!postItems.length) return <Card><EmptyState title={emptyTitle} /></Card>
    return (
      <KeyboardList label="Explore post feed" className="post-feed-keyboard post-feed">
        <VirtualList
          items={posts}
          estimateSize={360}
          label="Explore post feed"
          renderItem={post => (
            <PostCard
              post={post}
              router={router}
              currentUserId={currentUserId}
              onDeleted={removePost}
              onUpdated={updatePost}
            />
          )}
        />
      </KeyboardList>
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
    if (searchType.value === 'posts') return renderPosts(results, 'No posts found')
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
              <UserAvatar user={item} size="small" className="social-user-avatar" />
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
              <span>{item.memberCount} members</span>
              <a class="back-link" href={`/channels/${item.slug}`} onClick={router.link(`/channels/${item.slug}`)}>View channel →</a>
            </Card>
          ))}
      </div>
    )
  }

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
  return (
    <div class="explore-stack">
      <Card class="explore-search-card">
        <form class="explore-search-form" onSubmit={submit}>
          <FormField id="explore-search-input" label="Search">
            <TextField
              id="explore-search-input"
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
    </div>
  )
}

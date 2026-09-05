import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PageFrame } from './PageFrame.jsx'
import { UserAvatar } from '../components/UserAvatar.jsx'

const graphLimit = 12
const svgNamespace = 'http://www.w3.org/2000/svg'

function displayName(user) {
  return user?.profile?.displayName || user?.username || 'User'
}

function compactCount(value) {
  const count = Number(value || 0)
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(count)
}

function nodeY(index, count) {
  return count <= 1 ? 50 : 10 + (index * 80) / (count - 1)
}

function edgePath(side, y) {
  return side === 'followers'
    ? `M 18 ${y} C 29 ${y}, 39 50, 50 50`
    : `M 50 50 C 61 50, 71 ${y}, 82 ${y}`
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tagName)

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value))
  }

  return element
}

function GraphPersonNode({ user, side, index, count, router }) {
  const position = `${side === 'followers' ? 18 : 82}%`
  const top = `${nodeY(index, count)}%`
  return (
    <a
      class={`social-graph-person social-graph-person-${side}`}
      style={`left: ${position}; top: ${top};`}
      href={`/users/${user.username}`}
      onClick={router.link(`/users/${user.username}`)}
      aria-label={`${displayName(user)} @${user.username}`}
    >
      <UserAvatar user={user} size="small" className="social-graph-avatar" />
      <span class="social-graph-person-copy">
        <strong>{displayName(user)}</strong>
        <small>@{user.username}</small>
      </span>
    </a>
  )
}

function GraphAggregateNode({ side, count, index, total }) {
  return (
    <div
      class={`social-graph-aggregate social-graph-aggregate-${side}`}
      style={`left: ${side === 'followers' ? 18 : 82}%; top: ${nodeY(index, total)}%;`}
      role="status"
      aria-label={`${count} more ${side}`}
    >
      <strong>+{compactCount(count)}</strong>
      <small>more {side}</small>
    </div>
  )
}

function GraphNodeList({ users, extraCount, side, router }) {
  const total = users.length + (extraCount > 0 ? 1 : 0)
  return [
    ...users.map((user, index) => (
      <GraphPersonNode
        key={user.id}
        user={user}
        side={side}
        index={index}
        count={total}
        router={router}
      />
    )),
    extraCount > 0 && (
      <GraphAggregateNode
        key={`${side}-aggregate`}
        side={side}
        count={extraCount}
        index={users.length}
        total={total}
      />
    )
  ].filter(Boolean)
}

function GraphEdges({ followerNodeCount, followingNodeCount }) {
  const followerTotal = followerNodeCount > 0 ? followerNodeCount : 1
  const followingTotal = followingNodeCount > 0 ? followingNodeCount : 1
  const svg = createSvgElement('svg', {
    class: 'social-graph-edges',
    viewBox: '0 0 100 100',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true'
  })
  const defs = createSvgElement('defs')

  for (const [id, className] of [
    ['social-graph-arrow-incoming', 'social-graph-edge-incoming'],
    ['social-graph-arrow-outgoing', 'social-graph-edge-outgoing']
  ]) {
    const marker = createSvgElement('marker', {
      id,
      markerWidth: '5',
      markerHeight: '5',
      refX: '4',
      refY: '2.5',
      orient: 'auto'
    })
    marker.append(createSvgElement('path', { d: 'M0 0L5 2.5L0 5Z', class: className }))
    defs.append(marker)
  }

  svg.append(defs)

  for (let index = 0; index < followerNodeCount; index += 1) {
    svg.append(createSvgElement('path', {
      d: edgePath('followers', nodeY(index, followerTotal)),
      class: 'social-graph-edge social-graph-edge-incoming',
      'marker-end': 'url(#social-graph-arrow-incoming)'
    }))
  }

  for (let index = 0; index < followingNodeCount; index += 1) {
    svg.append(createSvgElement('path', {
      d: edgePath('following', nodeY(index, followingTotal)),
      class: 'social-graph-edge social-graph-edge-outgoing',
      'marker-end': 'url(#social-graph-arrow-outgoing)'
    }))
  }

  return svg
}

function GraphStage({ profile, followers, following, extraFollowers, extraFollowing, router }) {
  const followerNodes = followers.length + (extraFollowers > 0 ? 1 : 0)
  const followingNodes = following.length + (extraFollowing > 0 ? 1 : 0)
  return (
    <Card class="social-graph-card">
      <div class="social-graph-heading">
        <div>
          <Label size="small" tone="accent">DIRECT CONNECTIONS</Label>
          <h2>Who follows who</h2>
        </div>
        <span class="social-graph-depth">Depth 1 · {graphLimit} names per side</span>
      </div>
      <div class="social-graph-legend" aria-label="Social graph legend">
        <span><i class="social-graph-legend-dot social-graph-legend-incoming" aria-hidden="true"></i>follows you</span>
        <span><i class="social-graph-legend-dot social-graph-legend-outgoing" aria-hidden="true"></i>you follow</span>
      </div>
      <div class="social-graph-stage" aria-label={`Social graph for ${displayName(profile)}`}>
        <GraphEdges followerNodeCount={followerNodes} followingNodeCount={followingNodes} />
        <div class="social-graph-column-title social-graph-column-title-followers">Followers <span>{compactCount(profile.followerCount)}</span></div>
        <div class="social-graph-column-title social-graph-column-title-following">Following <span>{compactCount(profile.followingCount)}</span></div>
        <GraphNodeList users={followers} extraCount={extraFollowers} side="followers" router={router} />
        <GraphNodeList users={following} extraCount={extraFollowing} side="following" router={router} />
        <a class="social-graph-root" href={`/users/${profile.username}`} onClick={router.link(`/users/${profile.username}`)}>
          <UserAvatar user={profile} size="large" className="social-graph-root-avatar" />
          <strong>{displayName(profile)}</strong>
          <span>@{profile.username}</span>
          <small>You</small>
        </a>
      </div>
      <p class="social-graph-note">Large groups stay collapsed. Open a profile to explore its own connections.</p>
    </Card>
  )
}

export function SocialGraphPage({ router, username }) {
  const state = signal('loading')
  const error = signal('')
  const graph = signal(null)
  const loading = computed(() => state.value === 'loading')
  let active = true

  async function loadGraph() {
    state.value = 'loading'
    error.value = ''
    try {
      const encodedUsername = encodeURIComponent(username)
      const [profileResult, followersResult, followingResult] = await Promise.all([
        apiRequest(`/api/users/${encodedUsername}`),
        apiRequest(`/api/users/${encodedUsername}/followers?limit=${graphLimit}`),
        apiRequest(`/api/users/${encodedUsername}/following?limit=${graphLimit}`)
      ])
      if (!active) return

      const profile = profileResult.data.user
      const followers = followersResult.data || []
      const following = followingResult.data || []
      const followerCount = Number(profile.followerCount || 0)
      const followingCount = Number(profile.followingCount || 0)
      const followersVisible = profile.profile?.showFollowers !== false
      const followingVisible = profile.profile?.showFollowing !== false

      graph.value = {
        profile,
        followers,
        following,
        extraFollowers: followersVisible ? Math.max(0, followerCount - followers.length) : followerCount,
        extraFollowing: followingVisible ? Math.max(0, followingCount - following.length) : followingCount
      }
      state.value = 'ready'
    } catch (requestError) {
      if (!active) return
      error.value = requestError.message || 'Could not load social graph'
      state.value = 'error'
    }
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading social graph…</div></Card>
    if (state.value === 'error') {
      return <Card><EmptyState status="error" title="Social graph unavailable" description={error.value} action={Button({ children: 'Try again', onClick: loadGraph })} /></Card>
    }
    if (!graph.value) return null
    return <GraphStage {...graph.value} router={router} />
  })

  onMount(() => {
    loadGraph()
    return () => { active = false }
  })

  return (
    <PageFrame hideHeader>
      <div class="social-graph-stack">
        <div class="social-graph-toolbar">
          <span>Showing a small, readable slice of your network.</span>
          <Button variant="secondary" loading={loading} onClick={loadGraph}>Refresh graph</Button>
        </div>
        {content}
      </div>
    </PageFrame>
  )
}

import { computed, signal } from '../lib/vendor.js'
import { PostCard } from './PostCard.jsx'

function compareNodes(left, right, direction) {
  const leftTime = new Date(left.post.createdAt).getTime() || 0
  const rightTime = new Date(right.post.createdAt).getTime() || 0
  const comparison = leftTime - rightTime || String(left.post.id).localeCompare(String(right.post.id))
  return direction === 'desc' ? -comparison : comparison
}

function buildTree(posts, direction) {
  const nodes = posts.map(post => ({ post, children: [] }))
  const byId = new Map(nodes.map(node => [node.post.id, node]))
  const roots = []

  for (const node of nodes) {
    const parent = byId.get(node.post.parentPostId)
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const sortBranch = node => {
    node.children.sort((left, right) => compareNodes(left, right, direction))
    node.children.forEach(sortBranch)
  }

  roots.sort((left, right) => compareNodes(left, right, direction))
  roots.forEach(sortBranch)
  return roots
}

export function PostHierarchy({
  posts,
  router,
  currentUserId,
  onDeleted,
  onReply,
  onReposted,
  onUpdated,
  sortDirection = 'asc'
}) {
  const roots = buildTree(posts, sortDirection)
  const collapsed = signal(new Set())

  function toggleBranch(postId) {
    const next = new Set(collapsed.value)
    if (next.has(postId)) next.delete(postId)
    else next.add(postId)
    collapsed.value = next
  }

  function renderNode(node, level = 1) {
    const post = node.post
    const branchOpen = computed(() => !collapsed.value.has(post.id))
    const nodeClass = computed(() => [
      `post-tree-node post-tree-node-level-${Math.min(level, 3)}`,
      node.children.length > 0 ? 'post-tree-node-has-children' : '',
      node.children.length > 0 && !branchOpen.value ? 'post-tree-node-collapsed' : ''
    ].filter(Boolean).join(' '))
    const branchChildren = computed(() => branchOpen.value
      ? (
        <div class="post-tree-children" role="group">
          {node.children.map(child => renderNode(child, level + 1))}
        </div>
      )
      : null)

    return (
      <div
        key={post.id}
        class={nodeClass}
        role="treeitem"
        aria-level={level}
        aria-expanded={node.children.length > 0 ? computed(() => branchOpen.value ? 'true' : 'false') : undefined}
        aria-label={`${level === 1 ? 'Post' : 'Reply'} by ${post.author.displayName}`}
      >
        <div class="post-tree-card-row">
          {node.children.length > 0
            ? (
              <button
                class="post-tree-toggle"
                type="button"
                aria-expanded={computed(() => branchOpen.value ? 'true' : 'false')}
                aria-label={computed(() => branchOpen.value ? 'Collapse replies' : 'Expand replies')}
                title={computed(() => branchOpen.value ? 'Collapse replies' : 'Expand replies')}
                onClick={() => toggleBranch(post.id)}
              >
                {computed(() => branchOpen.value ? '▾' : '▸')}
              </button>
            )
            : <span class="post-tree-toggle-spacer" aria-hidden="true" />}
          <PostCard
            post={post}
            router={router}
            currentUserId={currentUserId}
            onDeleted={onDeleted}
            onReply={onReply}
            onReposted={onReposted}
            onUpdated={onUpdated}
          />
        </div>
        {branchChildren}
      </div>
    )
  }

  return (
    <div class="post-tree" role="tree" aria-label="Post reply hierarchy">
      {roots.map(node => renderNode(node))}
    </div>
  )
}

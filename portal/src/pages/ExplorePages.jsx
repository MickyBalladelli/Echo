import { ExploreContent } from '../components/ExploreContent.jsx'
import { PageFrame } from './PageFrame.jsx'

export function ExplorePage({ router, currentUserId }) {
  return (
    <PageFrame
      eyebrow="EXPLORE"
      title="Explore"
      description="Find people, words in posts, channels, and hashtags."
    >
      <ExploreContent router={router} currentUserId={currentUserId} />
    </PageFrame>
  )
}

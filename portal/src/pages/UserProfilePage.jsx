import { UserSocialContent } from '../components/UserSocialContent.jsx'
import { PageFrame } from './PageFrame.jsx'

export function UserProfilePage({ username, router, currentUserId }) {
  return (
    <PageFrame
      hideHeader
    >
      <a class="back-link" href="/" onClick={router.link('/')}>← Back to home</a>
      <UserSocialContent username={username} router={router} currentUserId={currentUserId} />
    </PageFrame>
  )
}

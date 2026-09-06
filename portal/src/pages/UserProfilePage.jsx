import { UserSocialContent } from '../components/UserSocialContent.jsx'
import { PageFrame } from './PageFrame.jsx'

export function UserProfilePage({ username, router, currentUserId }) {
  return (
    <PageFrame
      hideHeader
    >
      <UserSocialContent username={username} router={router} currentUserId={currentUserId} />
    </PageFrame>
  )
}

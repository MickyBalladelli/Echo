# Echo TODO

Twitter-like app built with JavaScript, Vite, PostgreSQL, Node.js, Express, Socket.IO, `@mickyballadelli/prism`, and `@mickyballadelli/matrix`.

## Priority rules

- **P0 — Must have:** App cannot work without it.
- **P1 — Core:** Main social product behavior.
- **P2 — Important:** Useful product depth and better experience.
- **P3 — Later:** Nice to have, scale, and advanced polish.

## P0 — Foundation and minimum usable app

### Project setup

- [x] Create Vite frontend app with JavaScript.
- [x] Create Node.js backend with Express.
- [x] Add shared config for frontend, backend, and database.
- [x] Add environment variable loading and validation.
- [x] Add development scripts for frontend and backend.
- [x] Add production build and serve setup.
- [x] Add error logging with safe production output.
- [x] Define API response shape and common error shape.
- [x] Define IDs, timestamps, pagination, and validation rules in the server.
- [x] Use `@mickyballadelli/prism` for the interface system.
- [x] Use `@mickyballadelli/matrix` SPA framework.
- [x] Use sequelize for the app's data/state model.

### PostgreSQL data layer

- [x] Create PostgreSQL database connection pool.
- [x] Add migrations and migration runner.
- [x] Add seed data for local development.
- [x] Add database transaction helper.
- [x] Add indexes for users, posts, replies, follows, channels, messages, and notifications.
- [x] Add soft-delete strategy where needed.
- [x] Create `users` table.
- [x] Create `sessions` or refresh-token table.
- [x] Create `profiles` or profile fields on `users`.
- [x] Create `posts` table with text, author, timestamps, and visibility.
- [x] Create post replies with a self-referencing `parent_post_id`.
- [x] Create `post_likes` table with one like per user per post.
- [x] Create `follows` table with one follow per user pair.
- [x] Create `channels` table.
- [x] Create `channel_members` table.
- [x] Create `notifications` table.
- [x] Create `notes` table.
- [x] Create chat conversations, members, messages, and read-state tables.

### Authentication and user identity

- [x] Add user registration with email or username and password.
- [x] Validate username, email, password, and display name.
- [x] Hash passwords securely.
- [x] Add login.
- [x] Add logout and session/token revocation.
- [x] Add current-user endpoint.
- [x] Protect authenticated API routes.
- [x] Protect Socket.IO connections with authentication.
- [x] Add rate limits for registration and login.
- [x] Do not leak whether an email or username exists.
- [x] Add basic auth error states in the UI.
- [x] Add profile page with avatar placeholder, bio, and join date.
- [x] Add edit profile for the signed-in user.

### App shell

- [x] Build authenticated and unauthenticated route states.
- [x] Build responsive layout: sidebar, main feed, and secondary panel.
- [x] Add navigation for Home, Explore, Notifications, Notes, Channels, Chat, and Profile.
- [x] Add loading, empty, and error states.
- [x] Add accessible keyboard focus and semantic controls.
- [x] Add sign-up, login, and logout screens.

### Basic posts

- [x] Add create-post composer.
- [x] Enforce post length limit.
- [x] Add create-post API endpoint.
- [x] Add home feed API endpoint with cursor pagination.
- [x] Show posts newest first.
- [x] Show author, avatar, text, time, reply count, like count, and follow state.
- [x] Add post detail page.
- [x] Add delete own post.
- [x] Add basic text escaping and input sanitization.

## P1 — Core social product

### Replies and conversations

- [ ] Add reply composer on post detail.
- [ ] Add nested or threaded replies with a safe depth limit.
- [ ] Add reply count updates.
- [ ] Add reply notifications to the post author.
- [ ] Add conversation view for a post and its replies.
- [ ] Add reply deletion for the reply owner.

### Likes

- [ ] Add like and unlike API endpoints.
- [ ] Make likes idempotent.
- [ ] Update like count and liked state in the UI.
- [ ] Add likes to notification events.
- [ ] Prevent self-like notification spam if desired by product rules.

### Following and feeds

- [ ] Add follow and unfollow endpoints.
- [ ] Add follow button and state.
- [ ] Notify users when someone follows them.
- [ ] Build Following feed from followed users.
- [ ] Keep Home feed behavior defined: Following-only or mixed discovery feed.
- [ ] Add follower and following lists.
- [ ] Add user profile post list.
- [ ] Prevent duplicate follow relationships.

### Explore and search

- [ ] Add Explore page.
- [ ] Add recent and popular posts view.
- [ ] Add user search.
- [ ] Add post search.
- [ ] Add channel search.
- [ ] Add search pagination.
- [ ] Add empty search state.

### Notifications

- [ ] Create notification event service.
- [ ] Notify on replies, likes, follows, channel invites/joins, and chat messages.
- [ ] Add notifications API with cursor pagination.
- [ ] Add unread notification count.
- [ ] Add mark-one-read action.
- [ ] Add mark-all-read action.
- [ ] Add real-time notification delivery through Socket.IO.
- [ ] Link each notification to its post, profile, channel, or chat.
- [ ] Avoid duplicate notifications for repeated events.

### Channels

- [ ] Add public channel creation.
- [ ] Add channel name, slug, description, image placeholder, and owner.
- [ ] Add channel list endpoint and page.
- [ ] Add channel detail page.
- [ ] Add join and leave channel actions.
- [ ] Add channel member list and member count.
- [ ] Add channel feed of posts.
- [ ] Add create-post-in-channel behavior.
- [ ] Add channel join notifications where appropriate.
- [ ] Add channel owner controls.
- [ ] Add private channels and invite rules after public channels work.

### Real-time foundation

- [ ] Add Socket.IO server and client connection.
- [ ] Authenticate sockets before joining rooms.
- [ ] Create rooms for users, channels, posts, and conversations.
- [ ] Add reconnect handling.
- [ ] Add connection status in the UI.
- [ ] Make real-time events safe to replay or ignore when duplicated.

## P1 — Notes system

- [ ] Define notes product rules: private by default, shared, or both.
- [ ] Add create, read, update, and delete note APIs.
- [ ] Add note title, body, tags, owner, timestamps, and archive state.
- [ ] Add Notes list page.
- [ ] Add note editor.
- [ ] Add autosave with debounce.
- [ ] Add draft and saved states.
- [ ] Add note search and filtering.
- [ ] Add note pinning or favorites.
- [ ] Add note permissions if notes can be shared.
- [ ] Add note conflict handling for multiple tabs or devices.
- [ ] Decide whether notes can become posts, and implement if wanted.

## P1 — Chat system

- [ ] Add one-to-one conversation creation.
- [ ] Add group conversation creation.
- [ ] Add conversation member management.
- [ ] Add send and receive text messages through Socket.IO.
- [ ] Persist every message in PostgreSQL.
- [ ] Add message history API with cursor pagination.
- [ ] Add conversation list sorted by recent activity.
- [ ] Add unread message counts.
- [ ] Add read receipts or last-read state.
- [ ] Add typing indicators.
- [ ] Add online/offline presence.
- [ ] Add reconnect and missed-message sync.
- [ ] Add edit or delete own message rules.
- [ ] Add block and mute behavior for chat.
- [ ] Add chat notifications with user controls.
- [ ] Add message and conversation moderation hooks.

## P2 — Product depth

### Post quality of life

- [ ] Add repost/quote-post behavior.
- [ ] Add bookmarks.
- [ ] Add drafts.
- [ ] Add post editing policy and edit history if allowed.
- [ ] Add hashtags and hashtag pages.
- [ ] Add mentions and mention autocomplete.
- [ ] Add link previews.
- [ ] Add image upload and image previews.
- [ ] Add video or GIF support only after storage limits are defined.
- [ ] Add content warnings.
- [ ] Add post visibility options.
- [ ] Add pinned post on profile.

### Profiles and social graph

- [ ] Add avatar and banner uploads.
- [ ] Add profile privacy settings.
- [ ] Add verified or staff badge model if needed.
- [ ] Add block, mute, and restrict users.
- [ ] Hide blocked-user content from feeds, search, channels, chat, and notifications.
- [ ] Add suggested users to follow.
- [ ] Add mutual-follow indicators.

### Channels depth

- [ ] Add channel moderators.
- [ ] Add channel rules and pinned posts.
- [ ] Add channel post approval or moderation mode.
- [ ] Add channel mute and notification preferences.
- [ ] Add channel member roles.
- [ ] Add channel discovery ranking.

### Notifications and preferences

- [ ] Add notification preferences by event type.
- [ ] Add email notification preference model without sending email yet.
- [ ] Add browser notification permission flow.
- [ ] Add notification grouping.
- [ ] Add notification retention policy.

### Moderation and safety

- [ ] Add report post, user, channel, and message actions.
- [ ] Add moderation queue data model.
- [ ] Add admin/moderator roles.
- [ ] Add admin review screens.
- [ ] Add content removal and appeal states.
- [ ] Add abuse rate limits for posting, replies, likes, follows, and messages.
- [ ] Add spam and suspicious-login detection hooks.
- [ ] Add audit log for moderation actions.

## P2 — Reliability, security, and operations

- [ ] Add request validation at every write endpoint.
- [ ] Add CSRF protection if cookie sessions are used.
- [ ] Add secure CORS policy.
- [ ] Add Helmet and secure HTTP headers.
- [ ] Add Socket.IO event validation and per-event rate limits.
- [ ] Add maximum payload sizes for HTTP and sockets.
- [ ] Add database connection health check.
- [ ] Add graceful shutdown for HTTP, Socket.IO, and PostgreSQL.
- [ ] Add structured request and event logs.
- [ ] Add error tracking integration point.
- [ ] Add backup and restore procedure for PostgreSQL.
- [ ] Add migration rollback guidance.
- [ ] Add pagination limits and query timeouts.
- [ ] Add cache strategy for hot feeds and channel lists.
- [ ] Add job queue strategy for notifications and heavy work.
- [ ] Add object storage strategy for uploads.
- [ ] Add deployment configuration for frontend, backend, PostgreSQL, and Socket.IO.

## P2 — Performance and accessibility

- [ ] Add optimistic updates for likes, follows, joins, and read states.
- [ ] Add virtualized long feeds and message lists.
- [ ] Add image resizing and lazy loading.
- [ ] Add database query profiling for feed and search queries.
- [ ] Add mobile layout support.
- [ ] Add screen-reader labels for actions and live updates.
- [ ] Add reduced-motion support.
- [ ] Add keyboard navigation for feeds, dialogs, notes, and chat.
- [ ] Add timezone-safe date formatting.

## P3 — Advanced features

- [ ] Add multi-device session management.
- [ ] Add password reset and email verification.
- [ ] Add two-factor authentication.
- [ ] Add OAuth login providers.
- [ ] Add private posts and protected profiles.
- [ ] Add scheduled posts.
- [ ] Add polls.
- [ ] Add long-form posts or threads.
- [ ] Add trending topics.
- [ ] Add real-time channel chat.
- [ ] Add voice messages or calls only if product needs them.
- [ ] Add data export and account deletion.
- [ ] Add analytics dashboard with privacy-safe event tracking.
- [ ] Add localization and multiple languages.
- [ ] Add offline draft support.

## Product decisions to make before P1 grows

- [ ] Pick session model: secure cookie session or short-lived access token plus refresh token.
- [ ] Pick backend database library or query builder.
- [ ] Decide whether `@mickyballadelli/matrix` owns client state only or also domain types.
- [ ] Decide whether `@mickyballadelli/prism` supplies the full design system or only visual primitives.
- [ ] Decide public post length and media limits.
- [ ] Decide feed ranking and pagination behavior.
- [ ] Decide whether channels are public, private, or both.
- [ ] Decide whether notes are private, shared, or convertible to posts.
- [ ] Decide one-to-one and group chat limits.
- [ ] Decide notification retention and delivery rules.
- [ ] Decide moderation roles and content policy.
- [ ] Decide upload storage provider and file scanning rules.

## Definition of done for first release

- [ ] A user can register, log in, log out, and edit a profile.
- [ ] A user can create, read, reply to, delete, and like posts.
- [ ] A user can follow another user and see a following feed.
- [ ] A user can list channels, join/leave a public channel, and post in it.
- [ ] A user receives in-app and real-time notifications for key social events.
- [ ] A user can create, edit, autosave, search, and delete notes.
- [ ] A user can start a chat, send messages, reload history, and see unread state.
- [ ] Unauthorized users cannot access protected data or socket rooms.
- [ ] Database migrations can build a fresh local database.
- [ ] The app has useful loading, empty, error, and reconnect states.
- [ ] The app works on desktop and mobile-sized screens.

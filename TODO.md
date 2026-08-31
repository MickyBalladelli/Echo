# Echo TODO

Twitter-like app built with JavaScript, Vite, PostgreSQL, Node.js, Express, Socket.IO, `@mickyballadelli/prism`, and `@mickyballadelli/matrix`.
Use `@mickyballadelli/matrix` and `@mickyballadelli/prism` fully for the frontend. Do not add another frontend framework. If a needed primitive is missing, add it to Prism first.
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
- [x] Use `@mickyballadelli/prism` as the only frontend UI and design system.
- [x] Use `@mickyballadelli/matrix` as the only frontend runtime, renderer, state, and router.
- [x] Use sequelize for the app's data/state model.

### Frontend framework contract

- [x] Use Matrix for all frontend JSX/rendering, reactive state, lifecycle, routing, async resources, and form bindings.
- [x] Use Prism for all frontend UI components, controls, layouts, feedback, overlays, icons, and theme tokens.
- [x] Keep Vite as the build tool only; do not add React, Vue, Svelte, or another frontend UI/state/router framework.
- [ ] Add missing Prism primitives before replacing native controls that Prism does not cover.
- [ ] Replace remaining native selects, textareas, and file inputs with Prism controls where available.
- [ ] Add Prism multiline text area and file-upload controls, then migrate Echo forms to them.

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

- [x] Add reply composer on post detail.
- [x] Add nested or threaded replies with a safe depth limit.
- [x] Add reply count updates.
- [x] Add reply notifications to the post author.
- [x] Add conversation view for a post and its replies.
- [x] Add reply deletion for the reply owner.

### Likes

- [x] Add like and unlike API endpoints.
- [x] Make likes idempotent.
- [x] Update like count and liked state in the UI.
- [x] Add likes to notification events.
- [x] Prevent self-like notification spam if desired by product rules.

### Following and feeds

- [x] Add follow and unfollow endpoints.
- [x] Add follow button and state.
- [x] Notify users when someone follows them.
- [x] Build Following feed from followed users.
- [x] Keep Home feed behavior defined: Following-only or mixed discovery feed.
- [x] Add follower and following lists.
- [x] Add user profile post list.
- [x] Prevent duplicate follow relationships.

### Explore and search

- [x] Add Explore page.
- [x] Add recent and popular posts view.
- [x] Add user search.
- [x] Add post search.
- [x] Add channel search.
- [x] Add search pagination.
- [x] Add empty search state.

### Notifications

- [x] Create notification event service.
- [x] Notify on replies, likes, follows, channel invites/joins, and chat messages.
- [x] Add notifications API with cursor pagination.
- [x] Add unread notification count.
- [x] Add mark-one-read action.
- [x] Add mark-all-read action.
- [x] Add real-time notification delivery through Socket.IO.
- [x] Link each notification to its post, profile, channel, or chat.
- [x] Avoid duplicate notifications for repeated events.

### Channels

- [x] Add public channel creation.
- [x] Add channel name, slug, description, image placeholder, and owner.
- [x] Add channel list endpoint and page.
- [x] Add channel detail page.
- [x] Add join and leave channel actions.
- [x] Add channel member list and member count.
- [x] Add channel feed of posts.
- [x] Add create-post-in-channel behavior.
- [x] Add channel join notifications where appropriate.
- [x] Add channel owner controls.
- [x] Add private channels and invite rules after public channels work.

### Real-time foundation

- [x] Add Socket.IO server and client connection.
- [x] Authenticate sockets before joining rooms.
- [x] Create rooms for users, channels, posts, and conversations.
- [x] Add reconnect handling.
- [x] Add connection status in the UI.
- [x] Make real-time events safe to replay or ignore when duplicated.

## P1 — Notes system

- [x] Define notes product rules: private by default, shared, or both.
- [x] Add create, read, update, and delete note APIs.
- [x] Add note title, body, tags, owner, timestamps, and archive state.
- [x] Add Notes list page.
- [x] Add note editor.
- [x] Add autosave with debounce.
- [x] Add draft and saved states.
- [x] Add note search and filtering.
- [x] Add note pinning or favorites.
- [x] Add note permissions if notes can be shared.
- [x] Add note conflict handling for multiple tabs or devices.
- [x] Decide whether notes can become posts, and implement if wanted.

## P1 — Chat system

- [x] Add one-to-one conversation creation.
- [x] Add group conversation creation.
- [x] Add conversation member management.
- [x] Add send and receive text messages through Socket.IO.
- [x] Persist every message in PostgreSQL.
- [x] Add message history API with cursor pagination.
- [x] Add conversation list sorted by recent activity.
- [x] Add unread message counts.
- [x] Add read receipts or last-read state.
- [x] Add typing indicators.
- [x] Add online/offline presence.
- [x] Add reconnect and missed-message sync.
- [x] Add edit or delete own message rules.
- [x] Add block and mute behavior for chat.
- [x] Add chat notifications with user controls.
- [x] Add message and conversation moderation hooks.

## P2 — Product depth

### Post quality of life

- [x] Add repost/quote-post behavior.
- [x] Add bookmarks.
- [x] Add drafts.
- [x] Add post editing policy and edit history if allowed.
- [x] Add hashtags and hashtag pages.
- [x] Add mentions and mention autocomplete.
- [x] Add link previews.
- [x] Add image upload and image previews.
- [ ] Add video or GIF support only after storage limits are defined.
- [x] Add content warnings.
- [x] Add post visibility options.
- [x] Add pinned post on profile.

### Profiles and social graph

- [x] Add avatar and banner uploads.
- [x] Add profile privacy settings.
- [x] Add verified or staff badge model if needed.
- [x] Add block, mute, and restrict users.
- [x] Hide blocked-user content from feeds, search, channels, chat, and notifications.
- [x] Add suggested users to follow.
- [x] Add mutual-follow indicators.

### Channels depth

- [x] Add channel moderators.
- [x] Add channel rules and pinned posts.
- [x] Add channel post approval or moderation mode.
- [x] Add channel mute and notification preferences.
- [x] Add channel member roles.
- [x] Add channel discovery ranking.

### Notifications and preferences

- [x] Add notification preferences by event type.
- [x] Add email notification preference model without sending email yet.
- [x] Add browser notification permission flow.
- [x] Add notification grouping.
- [x] Add notification retention policy.

### Moderation and safety

- [x] Add report post, user, channel, and message actions.
- [x] Add moderation queue data model.
- [x] Add admin/moderator roles.
- [x] Add admin review screens.
- [x] Add content removal and appeal states.
- [x] Add abuse rate limits for posting, replies, likes, follows, and messages.
- [x] Add spam and suspicious-login detection hooks.
- [x] Add audit log for moderation actions.

## P2 — Reliability, security, and operations

- [x] Add request validation at every write endpoint.
- [x] Add CSRF protection if cookie sessions are used.
- [x] Add secure CORS policy.
- [x] Add Helmet and secure HTTP headers.
- [x] Add Socket.IO event validation and per-event rate limits.
- [x] Add maximum payload sizes for HTTP and sockets.
- [x] Add database connection health check.
- [x] Add graceful shutdown for HTTP, Socket.IO, and PostgreSQL.
- [x] Add structured request and event logs.
- [x] Add error tracking integration point.
- [x] Add backup and restore procedure for PostgreSQL.
- [x] Add migration rollback guidance.
- [x] Add pagination limits and query timeouts.
- [x] Add cache strategy for hot feeds and channel lists.
- [x] Add job queue strategy for notifications and heavy work.
- [x] Add object storage strategy for uploads.
- [x] Add deployment configuration for frontend, backend, PostgreSQL, and Socket.IO.

## P2 — Performance and accessibility

- [x] Add optimistic updates for likes, follows, joins, and read states.
- [x] Add virtualized long feeds and message lists.
- [x] Add image resizing and lazy loading.
- [x] Add database query profiling for feed and search queries.
- [x] Add mobile layout support.
- [x] Add screen-reader labels for actions and live updates.
- [x] Add reduced-motion support.
- [x] Add keyboard navigation for feeds, dialogs, notes, and chat.
- [x] Add timezone-safe date formatting.

## P3 — Advanced features

- [x] Add multi-device session management.
- [x] Add password reset and email verification.
- [x] Add two-factor authentication.
- [x] Add OAuth login provider discovery and integration hooks.
- [x] Add private posts and protected profiles.
- [x] Add scheduled posts.
- [x] Add polls.
- [x] Add long-form posts or threads.
- [x] Add trending topics.
- [x] Add real-time channel chat.
- [x] Defer voice messages or calls until the product needs media calling.
- [x] Add data export and account deletion.
- [x] Add analytics dashboard with privacy-safe event tracking.
- [x] Add localization and multiple languages.
- [x] Add offline draft support.

## Product decisions to make before P1 grows

- [x] Pick session model: secure HttpOnly cookie session, 30-day lifetime, and server-side revocation.
- [x] Pick backend database library or query builder: Sequelize boundary with parameterized raw SQL for feature queries.
- [x] Decide whether `@mickyballadelli/matrix` owns client state only or also domain types: Matrix owns the full frontend runtime and client state; Echo feature modules own domain behavior.
- [x] Decide whether `@mickyballadelli/prism` supplies the full design system or only visual primitives: Prism supplies the full frontend design system; Echo owns product composition only.
- [x] Decide public post length and media limits: 280-character short posts, 20,000-character long posts, and bounded image uploads.
- [x] Decide feed ranking and pagination behavior: chronological cursor feeds, engagement-ranked popular posts, and scored channel discovery.
- [x] Decide whether channels are public, private, or both: both, with invite/member access for private channels.
- [x] Decide whether notes are private, shared, or convertible to posts: private by default, explicitly shared, and publishable when within short-post limits.
- [x] Decide one-to-one and group chat limits: one-to-one direct chats and groups capped at 20 invited people plus owner.
- [x] Decide notification retention and delivery rules: 90-day in-app/realtime retention with preference-aware email later.
- [x] Decide moderation roles and content policy: user/moderator/admin roles, queued reports, audited staff actions, and appeals.
- [x] Decide upload storage provider and file scanning rules: data-URL prototype now; private S3/R2-compatible storage and scanning in production.

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

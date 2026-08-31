# Echo product decisions

These choices lock the boundaries for P1 work. They match the current server and portal behavior unless a future decision below names a production adapter.

## Identity and foundations

- Sessions use a random, server-stored token in an HttpOnly, SameSite=Lax cookie. The cookie is Secure in production. Sessions last 30 days and can be revoked per device or all at once.
- PostgreSQL access uses Sequelize as the connection and transaction boundary. Parameterized raw SQL remains allowed for feature queries. Database changes use forward-only migrations.
- `@mickyballadelli/matrix` is the only frontend runtime. It owns JSX/rendering, reactive state, lifecycle, routing, async resources, form bindings, and client-side data flow. Echo feature modules own domain behavior and API response shapes, but no alternate frontend runtime or state/router framework is allowed.
- `@mickyballadelli/prism` is the only frontend UI and design system. Use its components, controls, layouts, feedback, overlays, icons, accessibility patterns, and theme tokens. Echo composes Prism pieces into product screens. If Prism lacks a needed primitive, add it to Prism before making a local substitute.
- Vite remains a build tool. Node.js, Express, Socket.IO, and PostgreSQL remain server-side infrastructure; they are not alternate frontend frameworks.

## Content and discovery

- Short posts are limited to 280 characters. Long posts are limited to 20,000 characters. Replies, quote text, and chat messages stay short; images use a 10 MB source limit, resize to a 1600 px maximum dimension, and obey the smaller encoded API limit.
- Home and following feeds are newest-first and use cursor pagination, with a default page size of 20 and a maximum of 100. Popular posts use engagement ordering and a short cache. Channel discovery uses its discovery score with cursor pagination.
- Channels can be public or private. Public channels are discoverable and joinable; private channels require membership or an invite. Owners and moderators manage channel membership and moderation.
- Notes are private by default. Users can explicitly share a note. A note can become a normal post through the publish action when it fits the 280-character short-post limit; longer notes remain notes.

## Communication, notifications, and safety

- Direct chats contain exactly two people. Group chats allow up to 20 invited people plus the owner, require a title up to 100 characters, and limit messages to 4,000 characters. Owners control membership.
- Notifications are retained for 90 days, grouped where useful, and delivered in-app and through realtime events. Per-type preferences are stored now. Email delivery waits for a configured delivery provider and must honor those preferences.
- Global roles are `user`, `moderator`, and `admin`. Reports enter a moderation queue; staff actions are audited. Content can be active, flagged, hidden/removed, or in an appeal state. Rate limits and block/restriction checks apply to abuse-sensitive actions.
- The prototype keeps resized images in data URLs and enforces MIME and byte limits. Production uploads move to private S3-compatible storage such as S3 or R2, using short-lived presigned URLs, server-side MIME/size checks, malware scanning, object keys, and CDN delivery with immutable hashes. Video and GIF uploads wait for this path.

## Revisit triggers

Revisit these decisions when a second client needs shared domain types, feed volume requires a distributed ranking/cache system, email delivery becomes a launch requirement, production media storage is enabled, or Prism/Matrix need a new primitive. Current Prism gaps for Echo are a multiline text area and a file-upload control.

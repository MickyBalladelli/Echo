# P3 advanced features

Echo now includes the P3 product paths behind the existing authenticated API and Prism portal:

- Sessions can be listed and revoked per device.
- Password-reset and email-verification tokens are single-use and expire after one hour. A delivery adapter is still needed for production email; development responses expose the token so local work is usable.
- TOTP two-factor authentication works with standard authenticator apps. The setup secret is shown once in account preferences.
- OAuth provider discovery and start routes exist for Google and GitHub. Add provider credentials and finish the provider callback adapter before enabling public login.
- Posts support public, followers-only, private, long-form, scheduled, and poll content. Existing profile privacy rules protect followers-only profiles.
- Scheduled posts are claimed by the existing server process every 30 seconds.
- Trending hashtags are calculated from public, visible posts from the last seven days.
- Channel members get persisted real-time channel chat through the existing Socket.IO channel rooms.
- Account export is JSON. Account deletion is a recoverable soft delete that revokes sessions and hides the account.
- Analytics stores only an allowlisted event name and small properties. It never stores IP addresses or raw session identifiers.
- Locale preferences feed the browser `lang` attribute and the existing `Intl` date formatting foundation.
- Post drafts save to local storage immediately and sync to the server when available.

Voice messages and calls remain intentionally deferred. Echo has no product requirement or media infrastructure for them yet.

ALTER TABLE user_notification_preferences
  DROP CONSTRAINT IF EXISTS user_notification_preferences_notification_type_check;

ALTER TABLE user_notification_preferences
  ADD CONSTRAINT user_notification_preferences_notification_type_check
  CHECK (notification_type IN (
    'reply', 'like', 'follow', 'channel_invite', 'channel_join', 'channel_post', 'chat_message', 'mention'
  ));

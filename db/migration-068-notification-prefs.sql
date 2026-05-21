-- migration-068: per-user in-app notification preferences.
--
-- JSON shape (NULL = use defaults, treated as everything-enabled):
--   {
--     "mention": true,
--     "reply": true,
--     "event": true,
--     "giveaway_kickoff": true
--   }
--
-- A type set to `false` means the notification row is NOT inserted for
-- that user. Defaults assume new accounts want all four types — they can
-- mute individual ones from the profile settings panel.

ALTER TABLE users
  ADD COLUMN notification_prefs JSON DEFAULT NULL;

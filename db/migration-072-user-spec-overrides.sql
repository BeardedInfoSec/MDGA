-- migration-072: user-editable main + off spec overrides on
-- user_characters.
--
-- user_characters.spec is auto-synced from Blizzard (the active spec
-- at last refresh). Members wanted to declare their *intended* main
-- spec independent of whatever they were last seen in, plus an off
-- spec — so the guild profile reflects what they actually play, not
-- whatever they happened to log out in.
--
-- Display logic in the frontend:
--   user_main_spec || spec   → "main"
--   user_off_spec            → "off"   (omitted if NULL)
--
-- The character-sync pipeline does NOT touch these columns, so a
-- Blizzard refresh can't wipe a member's choice.

ALTER TABLE user_characters
  ADD COLUMN user_main_spec VARCHAR(50) DEFAULT NULL,
  ADD COLUMN user_off_spec  VARCHAR(50) DEFAULT NULL;

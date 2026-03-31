USE `mdga_core-xTa5dfGz`;

-- Cache armory profile data on user_characters so we don't hit the API on every page load
ALTER TABLE user_characters
  ADD COLUMN level       TINYINT UNSIGNED DEFAULT NULL,
  ADD COLUMN race        VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN item_level  SMALLINT UNSIGNED DEFAULT NULL,
  ADD COLUMN media_url   VARCHAR(500) DEFAULT NULL,
  ADD COLUMN last_login  TIMESTAMP    NULL DEFAULT NULL;

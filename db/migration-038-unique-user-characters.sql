-- Migration 038: Add UNIQUE constraint on user_characters to prevent duplicate character links
-- First remove any existing duplicates (keep the earliest entry)
DELETE uc1 FROM user_characters uc1
INNER JOIN user_characters uc2
  ON uc1.user_id = uc2.user_id
  AND uc1.character_name = uc2.character_name
  AND uc1.realm_slug = uc2.realm_slug
  AND uc1.id > uc2.id;

-- Add the unique constraint
ALTER TABLE user_characters
  ADD UNIQUE KEY uq_user_char_realm (user_id, character_name, realm_slug);

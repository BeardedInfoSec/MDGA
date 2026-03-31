-- Add user_id to applications so we can link applicants to their user account
ALTER TABLE applications
  ADD COLUMN user_id INT UNSIGNED NULL AFTER discord_tag,
  ADD CONSTRAINT fk_app_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

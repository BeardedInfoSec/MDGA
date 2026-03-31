USE `mdga_core-xTa5dfGz`;

-- Discord-only auth: password and email no longer required
ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE users MODIFY email VARCHAR(255) NULL;

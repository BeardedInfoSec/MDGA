-- migration-073: Overlord newsletter archive.
--
-- Backs the hidden /overlord page — a public, direct-link-only gallery
-- of the daily "Overlord" newsletter images the GM designs. Officers
-- upload an image (optionally with a title + issue date) from the page
-- itself; everyone else just views. Not linked in the nav anywhere.
--
-- Display order is chronological-newest-first: COALESCE(issue_date,
-- DATE(created_at)) DESC, id DESC — so the latest issue is always on top
-- without anyone hand-maintaining a sort column.

CREATE TABLE IF NOT EXISTS overlord_newsletters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_url VARCHAR(512) NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  issue_date DATE DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_overlord_order (issue_date, id),
  CONSTRAINT fk_overlord_created_by FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

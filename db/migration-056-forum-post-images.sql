-- migration-056: multiple image attachments per forum post (rapazzini #29).
-- forum_posts.image_url stays for backward compatibility but new posts use
-- this table. Existing single-image posts are migrated in the same script
-- so the GET endpoint sees a uniform "images" array everywhere.

CREATE TABLE IF NOT EXISTS forum_post_images (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY post_id (post_id, sort_order),
  CONSTRAINT fk_fpi_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: existing single-image posts get a row in the new table so the
-- "show all images" gallery code path doesn't have to special-case legacy
-- posts. Idempotent: re-running won't duplicate (NOT EXISTS guard).
INSERT INTO forum_post_images (post_id, image_url, sort_order)
SELECT fp.id, fp.image_url, 0
FROM forum_posts fp
WHERE fp.image_url IS NOT NULL
  AND fp.image_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM forum_post_images fpi WHERE fpi.post_id = fp.id
  );

-- Carousel images managed from admin panel
CREATE TABLE IF NOT EXISTS carousel_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  image_url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(255) DEFAULT '',
  sort_order INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed with existing hardcoded images
INSERT INTO carousel_images (image_url, alt_text, sort_order) VALUES
  ('/images/image1.png', 'MDGA forces gathered at sunset', 1),
  ('/images/image.png', 'MDGA in battle formation', 2),
  ('/images/Screenshot_2026-02-06_18-22-48.png', 'MDGA assembled in Durotar', 3),
  ('/images/image-140.png', 'Battleground victory', 4),
  ('/images/5E45147D-7595-4207-B029-FD9F8DCE46C8.png', 'MDGA raid group on the move', 5),
  ('/images/Screenshot_2026-02-06_at_8.28.02_PM.png', 'MDGA members on mounts in Durotar', 6),
  ('/images/Screenshot_2025-05-27_214251.png', 'MDGA guild members gathered in Durotar', 7),
  ('/images/highest_shuff_ratig.png', 'Solo Arena 3102 Rating', 8),
  ('/images/image3.png', 'PvP Season Ratings', 9);

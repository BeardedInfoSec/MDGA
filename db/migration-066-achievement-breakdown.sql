-- migration-066: achievement-category breakdown scraped from Blizzard's
-- web armory /achievements page. Stored as JSON because the shape is a
-- list of { slug, name, count, total, points, totalPoints } and Blizzard
-- adds new categories every expansion. NULL = not yet scraped (or last
-- scrape returned null because Blizzard's web was flapping). Renderer
-- treats NULL as "show nothing" — never reuses stale data as a fallback.

ALTER TABLE pvp_stats
  ADD COLUMN achievement_breakdown JSON DEFAULT NULL;

-- migration-055: optional scheduled publish for forum posts and events
-- (rapazzini forum #39). NULL = publish immediately on insert; a future
-- timestamp hides the row from non-officer viewers until that time.
-- Officers see scheduled items in muted style so they can still preview /
-- edit / cancel them before the publish moment.

ALTER TABLE forum_posts
  ADD COLUMN publish_at TIMESTAMP NULL DEFAULT NULL AFTER deleted_by,
  ADD KEY publish_at (publish_at);

ALTER TABLE events
  ADD COLUMN publish_at TIMESTAMP NULL DEFAULT NULL,
  ADD KEY events_publish_at (publish_at);

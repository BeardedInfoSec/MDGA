-- migration-064: persist the IANA timezone the officer chose when scheduling
-- a forum post or event. Stored alongside publish_at (which is the UTC
-- instant). Required so the Edit Post modal re-opens with the originally
-- intended wall-clock, instead of the viewer's browser zone — the latter
-- silently shifts the displayed time by up to ~6h when an officer reopens
-- from a UTC-localed browser. publish_at remains the source of truth for
-- the actual fire moment; this column is purely for display intent.

ALTER TABLE forum_posts
  ADD COLUMN publish_timezone VARCHAR(64) DEFAULT NULL AFTER publish_at;

ALTER TABLE events
  ADD COLUMN publish_timezone VARCHAR(64) DEFAULT NULL AFTER publish_at;

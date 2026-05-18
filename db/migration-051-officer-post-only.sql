-- migration-051: per-category flag for "officers can start threads, anyone
-- can read + reply". Independent of officer_only (which fully gates the
-- category) and age_restricted (modal gate). Use this for announcements-
-- style categories where officers post but the floor is open for replies.

ALTER TABLE forum_categories
  ADD COLUMN officer_post_only TINYINT(1) NOT NULL DEFAULT 0
  AFTER age_restricted;

-- migration-047: per-category age-restriction flag for the forum.
-- When enabled, the frontend shows a one-time "this category contains
-- sensitive content — confirm you are 18+" modal before allowing entry.
-- Server doesn't enforce; this is consent UX, not access control.

ALTER TABLE forum_categories
  ADD COLUMN age_restricted TINYINT(1) NOT NULL DEFAULT 0
  AFTER officer_only;

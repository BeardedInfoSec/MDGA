-- migration-049: add users.display_rank for the actual guild rank label
-- (Honorbound, Champion, Durotarian, etc.) while users.rank stays as the
-- 5-tier enum that drives RBAC. This lets the badge show the authentic
-- faction-specific name without breaking permission checks that key off
-- the underlying tier.

ALTER TABLE users
  ADD COLUMN display_rank VARCHAR(50) NULL AFTER `rank`;

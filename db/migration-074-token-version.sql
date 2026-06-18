-- migration-074: per-user token_version for JWT revocation.
--
-- JWTs are stateless, so a leaked/outstanding token (especially the
-- long-lived 90-day companion and 7-day toolkit tokens) could not be
-- revoked short of rotating the global JWT_SECRET, which logs out everyone.
--
-- Every issued token now carries a `tv` claim equal to this column at
-- sign time; requireAuth/optionalAuth reject a token whose tv no longer
-- matches. Bumping token_version (POST /api/auth/logout-all) invalidates
-- all of that user's outstanding tokens without touching anyone else.
--
-- Default 0 so existing pre-migration tokens (no tv claim, treated as 0)
-- remain valid until their natural expiry.

ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0;

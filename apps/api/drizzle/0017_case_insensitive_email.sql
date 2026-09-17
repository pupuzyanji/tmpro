-- Case-insensitive email, tenant-scoped uniqueness stays intact.
--
-- The identifier-first login flow (POST /auth/identify) looks a user up by
-- email alone, before any tenant is known, so "Jeff@Acme.com" and
-- "jeff@acme.com" need to resolve to the same account rather than silently
-- being two different logins. Application code already lowercases email on
-- every write path (auth.service.ts, employees.service.ts generateLogins,
-- seed.ts); this migration is the database-level backstop, mirroring this
-- schema's existing two-layer pattern (app-level filter + a DB-level
-- constraint that holds even if a write path is ever missed).

-- Normalize any existing mixed-case data first.
UPDATE users SET email = lower(email) WHERE email <> lower(email);

-- Replace the case-sensitive unique index with a case-insensitive one, still
-- scoped per tenant (two different organizations can still each have their
-- own "jeff@acme.com" — see AuthService.identify()'s multi-match picker).
DROP INDEX IF EXISTS users_tenant_email_uq;
CREATE UNIQUE INDEX users_tenant_email_uq ON users (tenant_id, lower(email));

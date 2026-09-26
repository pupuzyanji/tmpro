-- v027.A — account security.
-- must_change_password: set when a login is created with a generated
-- temporary password (and on sign-in with the retired shared default), so
-- the person has to choose their own password before using tmPro. Cleared
-- by a self-service change or a completed reset link.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false;

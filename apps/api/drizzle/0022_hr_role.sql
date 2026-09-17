-- v019.A (follow-up): adds a fourth tenant-side login role, HR, between
-- Supervisor and Admin. HR gets everything an Admin gets EXCEPT the
-- Organization/Branches/Departments/Designations configuration tabs under
-- Settings, which stay Admin-only (enforced in SettingsController — see
-- that file's per-method @Roles(), not a class-level guard anymore).
-- Postgres requires an enum value to be added as its own statement, and it
-- can't be referenced in the same transaction it's added in — this
-- migration only adds the value, nothing here assigns it to a row.
ALTER TYPE "role" ADD VALUE 'HR';

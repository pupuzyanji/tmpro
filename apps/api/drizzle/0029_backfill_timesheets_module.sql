-- Timesheets (v022.A) is a new gated module added after existing tenants'
-- enabledModules arrays were already set. Backfill it on, same as every
-- other module was on by default before per-tenant entitlements existed —
-- a platform owner can still turn it back off per tenant from
-- Platform Admin, same as any other module.
UPDATE "tenants"
SET "enabled_modules" = array_append("enabled_modules", 'Timesheets')
WHERE NOT ('Timesheets' = ANY("enabled_modules"));

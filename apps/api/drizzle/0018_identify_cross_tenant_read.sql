-- Fixes POST /auth/identify returning "no account found" for every email on
-- any database where the app's Postgres role is NOT a superuser and doesn't
-- have BYPASSRLS — this is the exact gap the 0017 migration's companion
-- VERSION-LOG entry called out as a known limitation, not a new bug.
--
-- AuthService.identify() has to read across every tenant (the tenant isn't
-- known yet — that's the point of the lookup), via the plain, untenanted
-- `db` handle, so `app.current_tenant_id` is unset for that one query. The
-- existing `tenant_isolation` policies
-- (`tenant_id = current_setting('app.current_tenant_id', true)::uuid`)
-- compare against that unset value, which is NULL, so the comparison is
-- NULL (not true) for every row -- with FORCE ROW LEVEL SECURITY, that
-- silently empties the result for any role that isn't a superuser. Only the
-- default docker-compose Postgres role happened to be a superuser, which is
-- why this worked there and nowhere else.
--
-- Fix: add a second, permissive policy to exactly the tables identify()
-- reads (directly or via its LEFT JOINs), scoped narrowly to "no tenant
-- context is set". Every other query in this app runs inside withTenant(),
-- which always sets app.current_tenant_id first -- so for those queries
-- this new policy evaluates to false and the original tenant_isolation
-- policy is the only one that applies, unchanged. This is exercised only by
-- the one intentionally cross-tenant, pre-authentication lookup in the
-- app -- no other code path queries these tables outside a tenant context.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['users', 'organization_settings', 'employees', 'candidates'])
  LOOP
    EXECUTE format(
      'CREATE POLICY identify_lookup ON %I FOR SELECT USING (current_setting(''app.current_tenant_id'', true) IS NULL)',
      t
    );
  END LOOP;
END $$;

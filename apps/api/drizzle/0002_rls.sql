-- Row-Level Security: the structural second layer of tenant isolation.
--
-- Every request runs its DB work inside a transaction that does
--   SELECT set_config('app.current_tenant_id', $tenantId, true)
-- before any query (see src/db/client.ts -> withTenant()). These policies
-- key off that session variable, so even a query that forgot to filter by
-- tenantId in application code cannot read or write another tenant's rows.
-- FORCE ROW LEVEL SECURITY makes this apply even to the table owner (the
-- role the app connects as), not just other Postgres roles.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'employees', 'leave_types', 'leave_balances', 'leave_requests',
      'requisitions', 'candidates', 'goals', 'review_cycles',
      'performance_reviews', 'pay_runs', 'payslips', 'tax_profiles'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

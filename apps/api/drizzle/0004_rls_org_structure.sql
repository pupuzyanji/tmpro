-- Row-Level Security for the tables added in 0003_add_org_structure.sql —
-- same structural pattern as 0002_rls.sql (see that file's comment for why).
-- organization_settings is intentionally excluded: it has no natural
-- secondary key to policy on other than tenant_id itself, and is
-- single-row-per-tenant, so the same policy shape still applies cleanly.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'organization_settings', 'branches', 'departments', 'sections', 'designations',
      'employee_work_experience', 'employee_education', 'employee_dependents', 'employee_notes',
      'employee_status_history', 'employee_type_history', 'employee_compensation_history', 'employee_job_history',
      'performance_review_entries', 'performance_comments', 'announcements'
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

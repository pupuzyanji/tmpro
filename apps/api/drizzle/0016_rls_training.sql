-- Row-Level Security for the Training tables added in
-- 0015_training_courses.sql — same pattern as 0002_rls.sql,
-- 0004_rls_org_structure.sql, 0006_rls_documents.sql, and
-- 0010_rls_payroll_adjustments.sql.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'courses', 'course_quiz_questions', 'course_quiz_options', 'course_assignments'
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

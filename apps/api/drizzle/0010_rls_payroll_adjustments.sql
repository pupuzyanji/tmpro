-- Row-Level Security for payroll_adjustments (added in
-- 0009_payroll_adjustments_and_zm_defaults.sql) — same pattern as
-- 0002_rls.sql, 0004_rls_org_structure.sql, and 0006_rls_documents.sql.

ALTER TABLE "payroll_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_adjustments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_adjustments"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

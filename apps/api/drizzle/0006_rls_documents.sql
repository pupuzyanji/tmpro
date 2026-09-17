-- Row-Level Security for employee_documents (added in
-- 0005_add_documents_photo_components.sql) — same pattern as 0002_rls.sql
-- and 0004_rls_org_structure.sql.

ALTER TABLE "employee_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_documents"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

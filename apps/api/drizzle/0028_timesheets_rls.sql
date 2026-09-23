-- Row-Level Security for the new `timesheets` table (v022.A) — same
-- structural second layer of tenant isolation as drizzle/0002_rls.sql,
-- just added later since `timesheets` didn't exist at the time that file
-- ran. See 0002_rls.sql's header comment for the full rationale.

ALTER TABLE "timesheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timesheets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timesheets"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

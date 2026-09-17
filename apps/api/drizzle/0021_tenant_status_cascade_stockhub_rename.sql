-- v019.A: tenant status (active/inactive provisioning), tenant-admin
-- name fields on users, ON DELETE CASCADE on every tenant-scoped table (so
-- deleting an inactive tenant from Platform Admin removes all of its data
-- in one statement), and the Riverbird Technology NZ (Demo) -> Stockhub Ltd
-- demo-tenant rename.

-- --- tenant status -----------------------------------------------------
CREATE TYPE "tenant_status" AS ENUM ('ACTIVE', 'INACTIVE');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" "tenant_status" DEFAULT 'INACTIVE' NOT NULL;--> statement-breakpoint
-- Grandfather every tenant that existed before this column did onto ACTIVE
-- — they already have real users signing in today. Only tenants created
-- from here on via the platform-admin "Add Tenant" flow start INACTIVE.
UPDATE "tenants" SET "status" = 'ACTIVE';--> statement-breakpoint

-- --- tenant-admin name fields on users -----------------------------------
ALTER TABLE "users" ADD COLUMN "first_name" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(120);--> statement-breakpoint

-- --- cascade tenant deletes ------------------------------------------------
-- Every tenant-scoped table gets ON DELETE CASCADE on its tenant_id FK, so
-- TenantsAdminService.remove() can delete a tenant with a single
-- `DELETE FROM tenants WHERE id = $1` and have Postgres clean up every row
-- that belonged to it, in every table, in one transaction.
ALTER TABLE "announcement_reads" DROP CONSTRAINT "announcement_reads_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "branches" DROP CONSTRAINT "branches_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidates" DROP CONSTRAINT "candidates_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_assignments" DROP CONSTRAINT "course_assignments_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_quiz_options" DROP CONSTRAINT "course_quiz_options_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "course_quiz_options" ADD CONSTRAINT "course_quiz_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_quiz_questions" DROP CONSTRAINT "course_quiz_questions_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "course_quiz_questions" ADD CONSTRAINT "course_quiz_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT "courses_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "departments" DROP CONSTRAINT "departments_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "designations" DROP CONSTRAINT "designations_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_compensation_history" DROP CONSTRAINT "employee_compensation_history_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_compensation_history" ADD CONSTRAINT "employee_compensation_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_dependents" DROP CONSTRAINT "employee_dependents_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_dependents" ADD CONSTRAINT "employee_dependents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_education" DROP CONSTRAINT "employee_education_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_job_history" DROP CONSTRAINT "employee_job_history_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD CONSTRAINT "employee_job_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_notes" DROP CONSTRAINT "employee_notes_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_notes" ADD CONSTRAINT "employee_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_status_history" DROP CONSTRAINT "employee_status_history_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_type_history" DROP CONSTRAINT "employee_type_history_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_type_history" ADD CONSTRAINT "employee_type_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employee_work_experience" DROP CONSTRAINT "employee_work_experience_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employee_work_experience" ADD CONSTRAINT "employee_work_experience_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leave_balances" DROP CONSTRAINT "leave_balances_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "leave_types" DROP CONSTRAINT "leave_types_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_settings" DROP CONSTRAINT "organization_settings_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pay_runs" DROP CONSTRAINT "pay_runs_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" DROP CONSTRAINT "payroll_adjustments_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "performance_comments" DROP CONSTRAINT "performance_comments_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "performance_comments" ADD CONSTRAINT "performance_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "performance_review_entries" DROP CONSTRAINT "performance_review_entries_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "performance_review_entries" ADD CONSTRAINT "performance_review_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "performance_reviews" DROP CONSTRAINT "performance_reviews_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "requisitions" DROP CONSTRAINT "requisitions_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "review_cycles" DROP CONSTRAINT "review_cycles_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sections" DROP CONSTRAINT "sections_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tax_profiles" DROP CONSTRAINT "tax_profiles_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint

-- --- demo tenant rename: Riverbird Technology NZ (Demo) -> Stockhub Ltd ---
-- Renames the existing demo tenant in place (slug included) rather than
-- creating a new one, so a database that already migrated through v018.A
-- keeps the same tenant id and all its seeded data — only the public-facing
-- name and slug change. seed.ts is updated to match for fresh installs.
UPDATE "tenants" SET "slug" = 'stockhub-demo', "name" = 'Stockhub Ltd' WHERE "slug" = 'riverbird-demo';--> statement-breakpoint
-- organization_settings is tenant-scoped (RLS tenant_isolation policy), and
-- this migration runs with no app.current_tenant_id session var set, so a
-- plain UPDATE here would silently match zero rows instead of erroring —
-- set it for this transaction first so the row is actually visible.
DO $$
DECLARE
  tid uuid;
BEGIN
  SELECT "id" INTO tid FROM "tenants" WHERE "slug" = 'stockhub-demo';
  IF tid IS NOT NULL THEN
    PERFORM set_config('app.current_tenant_id', tid::text, true);
    UPDATE "organization_settings" SET "name" = 'Stockhub Ltd' WHERE "tenant_id" = tid AND "name" = 'Riverbird Technology NZ';
  END IF;
END $$;--> statement-breakpoint

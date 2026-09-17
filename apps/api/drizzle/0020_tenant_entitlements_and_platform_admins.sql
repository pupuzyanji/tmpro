-- v018.A: tenant module entitlements + seat cap, and a platform-admin login
-- separate from tenant-scoped ADMIN accounts.
ALTER TABLE "tenants" ADD COLUMN "enabled_modules" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "seat_cap" integer;--> statement-breakpoint
-- Grandfather every EXISTING tenant onto every module: before this
-- migration, every tenant behaviorally had all of them (there was no
-- entitlement system at all), so a bare '{}' default would otherwise lock
-- out every tenant already running on migration day. New tenants created
-- after this migration (via seed.ts or the platform-admin "create tenant"
-- flow) start deliberately empty until the platform owner grants modules
-- — see ModuleGuard and TenantsAdminService.
UPDATE "tenants" SET "enabled_modules" = ARRAY[
	'Employee Records', 'Leave & Attendance', 'Performance Management', 'Payroll',
	'Recruitment', 'Training & LMS', 'Policies & Documents', 'Reports & Analytics'
];--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
-- No RLS policy here, deliberately: like `tenants` and `org_signup_requests`,
-- `platform_admins` has no `tenant_id` column and is never queried inside
-- withTenant() — a platform admin's whole job is reading/writing across
-- tenants, which per-tenant RLS exists to prevent. See schema.ts.

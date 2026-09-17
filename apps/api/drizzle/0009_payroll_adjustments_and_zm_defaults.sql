CREATE TYPE "public"."payroll_adjustment_status" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payroll_adjustment_type" AS ENUM('ADDITION', 'DEDUCTION');--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "payroll_adjustment_type" NOT NULL,
	"label" varchar(160) NOT NULL,
	"amount" double precision NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"status" "payroll_adjustment_status" DEFAULT 'PENDING' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "country_code" SET DEFAULT 'ZM';--> statement-breakpoint
ALTER TABLE "leave_types" ALTER COLUMN "country_code" SET DEFAULT 'ZM';--> statement-breakpoint
ALTER TABLE "organization_settings" ALTER COLUMN "currency" SET DEFAULT 'ZMW';--> statement-breakpoint
ALTER TABLE "organization_settings" ALTER COLUMN "working_hours_start" SET DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE "organization_settings" ALTER COLUMN "working_hours_end" SET DEFAULT '17:00';--> statement-breakpoint
ALTER TABLE "organization_settings" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Lusaka';--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_adjustments_tenant_idx" ON "payroll_adjustments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payroll_adjustments_tenant_employee_idx" ON "payroll_adjustments" USING btree ("tenant_id","employee_id");
CREATE TYPE "public"."timesheet_status" AS ENUM('PENDING', 'APPROVED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"breaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_hours" double precision NOT NULL,
	"work_site" varchar(160),
	"position" varchar(160),
	"work_type" varchar(60),
	"notes" text,
	"status" timesheet_status DEFAULT 'PENDING' NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "timesheets_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_decided_by_id_employees_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timesheets_tenant_idx" ON "timesheets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "timesheets_tenant_employee_idx" ON "timesheets" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "timesheets_tenant_status_idx" ON "timesheets" USING btree ("tenant_id","status");
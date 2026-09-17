-- Compensation section rework: a single unified Basic Pay Rate + typed
-- Allowances shape for every country (no more ZM-only free-form
-- `components`), plus a per-record Currency the rate was quoted in.
-- See apps/api/src/db/schema.ts (employeeCompensationHistory) and the
-- native payroll rulesets (both now read this same shape).
ALTER TABLE "employee_compensation_history" ADD COLUMN "currency" varchar(8) DEFAULT 'ZMW' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_compensation_history" ADD COLUMN "allowances" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_compensation_history" DROP COLUMN "components";

ALTER TABLE "employee_compensation_history" ADD COLUMN "hours_per_week" double precision;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "is_paid" boolean DEFAULT true NOT NULL;
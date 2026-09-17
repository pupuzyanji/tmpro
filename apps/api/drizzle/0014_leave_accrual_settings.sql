CREATE TYPE "public"."leave_accrual_period" AS ENUM('DAILY', 'MONTHLY', 'ANNUALLY');--> statement-breakpoint
ALTER TABLE "leave_types" ALTER COLUMN "country_code" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "leave_types" ALTER COLUMN "country_code" SET DEFAULT 'ZM';--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "accrual_period" "leave_accrual_period" DEFAULT 'ANNUALLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "carry_over_enabled" boolean DEFAULT false NOT NULL;
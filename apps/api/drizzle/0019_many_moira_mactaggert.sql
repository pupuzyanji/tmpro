CREATE TYPE "public"."org_signup_status" AS ENUM('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "org_signup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(255) NOT NULL,
	"organisation_name" varchar(200) NOT NULL,
	"country" varchar(120) NOT NULL,
	"staff_complement" integer NOT NULL,
	"features_needed" text[] DEFAULT '{}' NOT NULL,
	"status" "org_signup_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "employment_type" "employment_type";--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "location" varchar(160);--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "role_summary" text;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "what_youll_do" text;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "what_youll_bring" text;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "what_youll_get" text;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "why_us" text;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "published_at" timestamp;
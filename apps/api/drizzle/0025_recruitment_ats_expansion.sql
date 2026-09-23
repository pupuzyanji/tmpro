ALTER TABLE "candidates" ADD COLUMN "phone" varchar(40);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "expected_salary" varchar(120);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "notice_period" varchar(120);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "right_to_work" varchar(30);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "how_heard" varchar(60);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "education" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "work_experience" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_data_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_text" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "cover_letter_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "cover_letter_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "cover_letter_data_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "cover_letter_text" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "ats_score" integer;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "matched_skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "missing_skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "required_skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "target_start_date" timestamp;
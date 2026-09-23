ALTER TABLE "employee_job_history" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD COLUMN "source_of_hire" varchar(120);--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD COLUMN "work_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD COLUMN "country_code" varchar(2);--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD COLUMN "start_date" timestamp;--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD CONSTRAINT "employee_job_history_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;
-- v012.A batch: structured addresses (street/town-city/province/country) on
-- organization_settings and branches replacing the old single free-text
-- `address` column; company-level regulatory identifiers on
-- organization_settings; employees.driver_license renamed to id_no plus new
-- ssn/nhi_id/tax_id personal identifiers; and a location_branch_id FK on
-- employee_job_history so Job Information's Location can be selected from
-- Branches instead of typed freely.
ALTER TABLE "organization_settings" ADD COLUMN "street" varchar(200);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "town_city" varchar(120);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "province" varchar(120);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "country" varchar(120);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "superannuation_no" varchar(60);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "tax_id" varchar(60);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "health_insurance_id" varchar(60);--> statement-breakpoint
ALTER TABLE "organization_settings" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "street" varchar(200);--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "town_city" varchar(120);--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "province" varchar(120);--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "country" varchar(120);--> statement-breakpoint
ALTER TABLE "branches" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "employees" RENAME COLUMN "driver_license" TO "id_no";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "ssn" varchar(60);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "nhi_id" varchar(60);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "tax_id" varchar(60);--> statement-breakpoint
ALTER TABLE "employee_job_history" ADD COLUMN "location_branch_id" uuid REFERENCES "branches"("id");

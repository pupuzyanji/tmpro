-- "Sign-up Here" form's Phone number field (v023.A) — country-code dropdown
-- + local number, combined into one string on submit. Nullable: existing
-- rows from before this field existed have nothing to backfill.
ALTER TABLE "org_signup_requests" ADD COLUMN "phone" varchar(40);

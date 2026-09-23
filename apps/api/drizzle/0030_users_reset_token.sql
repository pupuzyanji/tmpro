-- Admin/HR "Reset password" (People profile > Permission tab, v023.A) —
-- storage for the emailed one-time reset link. See schema.ts's comment on
-- users.resetTokenHash for why this stores a hash rather than the raw token.
ALTER TABLE "users" ADD COLUMN "reset_token_hash" varchar(64);
ALTER TABLE "users" ADD COLUMN "reset_token_expires_at" timestamp;
CREATE INDEX "users_reset_token_idx" ON "users" ("reset_token_hash");

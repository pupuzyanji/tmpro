-- v025.A — self-serve subscription billing (Stripe).
-- Every tenant gets a plan (CORE/GROWTH/PRO), a size band (B20/B50/B100/B200)
-- and a billing status. Tenants that existed before billing are grandfathered
-- as MANUAL: the platform owner keeps managing their modules/seat cap by hand
-- and they are never charged through Stripe.
ALTER TABLE tenants
  ADD COLUMN plan varchar(20),
  ADD COLUMN band varchar(10),
  ADD COLUMN billing_status varchar(30) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN billing_email varchar(255),
  ADD COLUMN country varchar(120),
  ADD COLUMN stripe_customer_id varchar(255),
  ADD COLUMN stripe_subscription_id varchar(255),
  ADD COLUMN trial_ends_at timestamp,
  ADD COLUMN current_period_end timestamp;

CREATE UNIQUE INDEX tenants_stripe_customer_uq ON tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX tenants_stripe_subscription_uq ON tenants (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Stripe webhook idempotency: Stripe can deliver the same event more than
-- once. Un-tenanted, like `tenants` itself — an event arrives before we know
-- (or can trust) which tenant it belongs to.
CREATE TABLE billing_events (
  id varchar(255) PRIMARY KEY,
  type varchar(100) NOT NULL,
  received_at timestamp NOT NULL DEFAULT now()
);

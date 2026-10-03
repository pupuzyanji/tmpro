-- v031.A — campaign tracking: short links (/go/<slug>), their clicks,
-- anonymous funnel events from the public pages, and the campaign a new
-- organisation came from. All untenanted, like `tenants`: they describe
-- tmPro's own marketing, not any customer's data.
CREATE TABLE IF NOT EXISTS tracked_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  destination varchar(300) NOT NULL,
  utm_source varchar(80) NOT NULL,
  utm_medium varchar(80),
  utm_campaign varchar(120),
  utm_content varchar(160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  device varchar(20),
  country varchar(8),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_clicks_link_idx ON link_clicks (link_id, created_at);

CREATE TABLE IF NOT EXISTS marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(20) NOT NULL,
  visitor_id varchar(64),
  path varchar(300),
  detail varchar(120),
  link_slug varchar(80),
  utm_source varchar(80),
  utm_medium varchar(80),
  utm_campaign varchar(120),
  utm_content varchar(160),
  referrer varchar(300),
  device varchar(20),
  country varchar(8),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_events_created_idx ON marketing_events (created_at);
CREATE INDEX IF NOT EXISTS marketing_events_slug_idx ON marketing_events (link_slug);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS attribution jsonb;
ALTER TABLE org_signup_requests ADD COLUMN IF NOT EXISTS attribution jsonb;

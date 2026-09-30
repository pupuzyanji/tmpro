-- v030.A — Pay run stages and approvals.
--
--   * pay_runs gain a lifecycle: DRAFT (being prepared and reviewed) →
--     SUBMITTED (awaiting approval) → APPROVED (locked) → PAID. A new run is
--     now created as DRAFT; runs made before v030.A stay APPROVED or PAID.
--   * pay_run_events: the run's audit trail — created, recalculated,
--     submitted (with any checks overridden), approved (level 1 or 2), sent
--     back, reopened, marked paid — with who, when and any comment.
--   * payroll_approval_settings: per payroll country, how many approvals a
--     run needs and when a second one is required.
--   * payroll_approvers: who may approve, per country and level.
--   * users.can_approve_payroll: the Permission-tab switch that lets a
--     person be named as an approver (they need no HR or Admin role).

ALTER TYPE pay_run_status ADD VALUE IF NOT EXISTS 'SUBMITTED' BEFORE 'APPROVED';

ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS pay_date date;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS prepared_by_user_id uuid;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS calculated_at timestamp;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS submitted_at timestamp;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS approvals_required integer;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS approval_reasons jsonb NOT NULL DEFAULT '[]';
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS submitted_checks jsonb;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS paid_at timestamp;

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_approve_payroll boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pay_run_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  pay_run_id     uuid NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  action         varchar(24) NOT NULL CHECK (action IN
                   ('CREATED','RECALCULATED','SUBMITTED','APPROVED','SENT_BACK','REOPENED','PAID')),
  level          integer,
  actor_user_id  uuid,
  actor_name     varchar(200),
  comment        text,
  data           jsonb NOT NULL DEFAULT '{}',
  created_at     timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_run_events_run_idx ON pay_run_events (tenant_id, pay_run_id, created_at);

CREATE TABLE IF NOT EXISTS payroll_approval_settings (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  country_code               varchar(2) NOT NULL,
  approvals_required         integer NOT NULL DEFAULT 1 CHECK (approvals_required IN (1, 2)),
  second_when_cost_over      numeric(16,2),
  second_when_increase_pct   numeric(6,2),
  second_when_override       boolean NOT NULL DEFAULT true,
  preparer_cannot_approve    boolean NOT NULL DEFAULT true,
  send_back_needs_comment    boolean NOT NULL DEFAULT true,
  notify_on_submit           boolean NOT NULL DEFAULT true,
  notify_on_decision         boolean NOT NULL DEFAULT true,
  updated_at                 timestamp NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_code)
);

CREATE TABLE IF NOT EXISTS payroll_approvers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  country_code  varchar(2) NOT NULL,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level         varchar(3) NOT NULL DEFAULT 'ANY' CHECK (level IN ('1','2','ANY')),
  created_at    timestamp NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_code, user_id)
);

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['pay_run_events','payroll_approval_settings','payroll_approvers'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

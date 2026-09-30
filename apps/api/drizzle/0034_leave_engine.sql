-- v028.A — Leave engine (ledger-based), replacing the v014 recompute-on-read
-- model. See docs/LEAVE-ENGINE.md and the project doc tmpro-leave-zambia.md.
--
-- What changes:
--   * leave_balances is dropped: balances are now derived from leave_ledger,
--     an append-only log of every change (opening balance, accrual,
--     allotment, usage, reversal, adjustment, expiry, payout).
--   * leave_types gains the fields that describe *how* a type behaves (kind,
--     counting basis, gender, reason/attachment rules, approval flow); the
--     numbers move to effective-dated leave_policies.
--   * Country rule templates (platform-owned) seed each tenant's policies —
--     Zambia (Employment Code Act 2019) is the first; any other country
--     falls back to a generic template the tenant fills in.
--   * Existing tenants are converted by the API on start-up (see
--     src/modules/leave/engine/provision.ts): legacy types are mapped to the
--     new codes, and every APPROVED request becomes a ledger USAGE entry.

-- ---------------------------------------------------------------- platform
CREATE TABLE IF NOT EXISTS leave_rule_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    varchar(10) NOT NULL,          -- 'ZM', or '*' for the generic fallback
  version         varchar(40) NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  legal_basis     text NOT NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  UNIQUE (country_code, version)
);

CREATE TABLE IF NOT EXISTS leave_rule_template_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES leave_rule_templates(id) ON DELETE CASCADE,
  code            varchar(32) NOT NULL,
  name            varchar(120) NOT NULL,
  kind            varchar(12) NOT NULL CHECK (kind IN ('ACCRUING','ALLOWANCE','EVENT','EPISODE','UNTRACKED')),
  unit_basis      varchar(16) NOT NULL CHECK (unit_basis IN ('WORKING_DAYS','CALENDAR_DAYS')),
  cycle           varchar(24) NOT NULL,
  statutory_min   numeric(7,2),                  -- the legal floor (null = none)
  defaults        jsonb NOT NULL DEFAULT '{}',   -- policy + type defaults copied into the tenant
  section_ref     varchar(40),
  sort_order      int NOT NULL DEFAULT 100,
  UNIQUE (template_id, code)
);

-- Gazetted one-off holidays (elections, inaugurations) and corrections to the
-- rule-generated national calendar. Recurring holidays are generated in code
-- (src/modules/leave/engine/holidays.ts) so no yearly seeding is needed.
CREATE TABLE IF NOT EXISTS public_holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  varchar(10) NOT NULL,
  holiday_date  date NOT NULL,
  name          varchar(120) NOT NULL,
  is_paid       boolean NOT NULL DEFAULT true,
  is_removed    boolean NOT NULL DEFAULT false,   -- true = cancels a generated holiday
  source_ref    text,
  UNIQUE (country_code, holiday_date)
);

-- ---------------------------------------------------------------- tenant
CREATE TABLE IF NOT EXISTS leave_settings (
  tenant_id               uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  daily_rate_divisor      numeric(6,2) NOT NULL DEFAULT 26,  -- leave pay: monthly basic ÷ divisor
  sick_episode_link_days  int NOT NULL DEFAULT 14,           -- a new sick absence within N days continues the episode
  engine_started_on       date NOT NULL DEFAULT CURRENT_DATE,     -- terminations before this are treated as settled outside tmPro
  provisioned_at          timestamp,
  last_processed_at       timestamp,
  updated_at              timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          varchar(80) NOT NULL,
  day_weights   numeric(3,2)[] NOT NULL,         -- Mon..Sun, e.g. {1,1,1,1,1,0,0}
  hours_per_day numeric(4,2) NOT NULL DEFAULT 8,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamp NOT NULL DEFAULT now(),
  CHECK (array_length(day_weights, 1) = 7)
);
CREATE INDEX IF NOT EXISTS work_schedules_tenant_idx ON work_schedules (tenant_id);

CREATE TABLE IF NOT EXISTS tenant_holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  country_code  varchar(10),                     -- null = every country the tenant operates in
  holiday_date  date NOT NULL,
  name          varchar(120) NOT NULL,
  is_paid       boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_holidays_tenant_idx ON tenant_holidays (tenant_id, holiday_date);

-- leave_types: how a type behaves. Numbers live in leave_policies.
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS code varchar(32);
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS kind varchar(12) NOT NULL DEFAULT 'ALLOWANCE';
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS unit_basis varchar(16) NOT NULL DEFAULT 'WORKING_DAYS';
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS gender_restriction varchar(8) NOT NULL DEFAULT 'ANY';
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS reason_required boolean NOT NULL DEFAULT false;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS reason_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS attachment_required boolean NOT NULL DEFAULT false;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS attachment_from_units numeric(5,2);   -- e.g. sick: required when > 1 day
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS approval_flow jsonb NOT NULL DEFAULT '["SUPERVISOR"]';
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS template_item_id uuid REFERENCES leave_rule_template_items(id);
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 100;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE leave_types ADD CONSTRAINT leave_types_kind_chk CHECK (kind IN ('ACCRUING','ALLOWANCE','EVENT','EPISODE','UNTRACKED'));
ALTER TABLE leave_types ADD CONSTRAINT leave_types_gender_chk CHECK (gender_restriction IN ('ANY','FEMALE','MALE'));
CREATE UNIQUE INDEX IF NOT EXISTS leave_types_tenant_country_code_uq ON leave_types (tenant_id, country_code, code) WHERE code IS NOT NULL;

-- Effective-dated policy versions. A change in Settings closes the current
-- version (effective_to) and opens a new one, so past accruals keep the rule
-- that applied at the time.
CREATE TABLE IF NOT EXISTS leave_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leave_type_id        uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  effective_from       date NOT NULL,
  effective_to         date,
  entitlement          numeric(7,2) NOT NULL DEFAULT 0,   -- per year (ACCRUING), per cycle (ALLOWANCE), per event (EVENT)
  cycle                varchar(24) NOT NULL,              -- EMPLOYMENT_ANNIVERSARY | CALENDAR_YEAR | CALENDAR_MONTH | PER_EVENT | PER_EPISODE | NONE
  accrual_frequency    varchar(10) NOT NULL DEFAULT 'NONE', -- MONTHLY | UPFRONT | NONE
  prorate_partial      boolean NOT NULL DEFAULT true,
  usable_after_months  int NOT NULL DEFAULT 0,
  min_service_months   int NOT NULL DEFAULT 0,
  eligible_categories  text[],                            -- null = every category
  carry_forward_max    numeric(7,2),                      -- null = unlimited
  excess_action        varchar(10) NOT NULL DEFAULT 'CARRY_ALL', -- CARRY_ALL | PAYOUT | FORFEIT
  allow_negative       numeric(7,2) NOT NULL DEFAULT 0,
  pay_rules            jsonb NOT NULL DEFAULT '{}',
  event_rules          jsonb NOT NULL DEFAULT '{}',
  below_statutory_ok   boolean NOT NULL DEFAULT false,
  exemption_reason     text,
  created_by           uuid,
  created_at           timestamp NOT NULL DEFAULT now(),
  CHECK (NOT below_statutory_ok OR exemption_reason IS NOT NULL),
  CHECK (excess_action IN ('CARRY_ALL','PAYOUT','FORFEIT')),
  CHECK (accrual_frequency IN ('MONTHLY','UPFRONT','NONE'))
);
CREATE INDEX IF NOT EXISTS leave_policies_type_idx ON leave_policies (tenant_id, leave_type_id, effective_from);

-- Employees: what the rules need to know.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_category varchar(12);   -- PERMANENT | FIXED_TERM | TEMPORARY | CASUAL (null = PERMANENT)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_term varchar(6);          -- SHORT (≤12 months) | LONG (null = derived)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_end_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS continuous_service_from date;      -- service start incl. time before tmPro
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_schedule_id uuid REFERENCES work_schedules(id);

-- Requests: half days, events, episodes, attachments, multi-step approval.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS policy_id uuid REFERENCES leave_policies(id);
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_half boolean NOT NULL DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_half boolean NOT NULL DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS event_date date;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS multiple_birth boolean NOT NULL DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS episode_id uuid;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_document_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS requested_by_user_id uuid;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approval_steps jsonb NOT NULL DEFAULT '[]';   -- snapshot of the flow at submission
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS current_step int NOT NULL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS pay_breakdown jsonb NOT NULL DEFAULT '{}';   -- {"FULL":3,"HALF":2,"UNPAID":0}
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS cancelled_at timestamp;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS decision_comment text;

CREATE TABLE IF NOT EXISTS leave_request_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id    uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  step          int NOT NULL,
  step_role     varchar(12) NOT NULL,           -- SUPERVISOR | HR | AUTO
  decided_by_user_id uuid,
  decision      varchar(10) NOT NULL CHECK (decision IN ('APPROVED','DECLINED','AUTO')),
  comment       text,
  decided_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_request_approvals_req_idx ON leave_request_approvals (request_id);

-- One row per calendar day a request covers, with the units counted that day
-- and the pay factor payroll must apply (1 full, 0.5 half, 0 unpaid).
CREATE TABLE IF NOT EXISTS leave_request_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id),
  day         date NOT NULL,
  units       numeric(4,2) NOT NULL,
  pay_factor  numeric(3,2) NOT NULL DEFAULT 1,
  UNIQUE (request_id, day)
);
CREATE INDEX IF NOT EXISTS leave_request_days_emp_idx ON leave_request_days (tenant_id, employee_id, day);

CREATE TABLE IF NOT EXISTS sick_leave_episodes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id      uuid NOT NULL REFERENCES employees(id),
  started_on       date NOT NULL,
  last_day         date NOT NULL,
  full_pay_used    numeric(7,2) NOT NULL DEFAULT 0,
  half_pay_used    numeric(7,2) NOT NULL DEFAULT 0,
  unpaid_used      numeric(7,2) NOT NULL DEFAULT 0,
  status           varchar(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','DISCHARGE_REVIEW')),
  opening_batch_id uuid,
  created_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sick_leave_episodes_emp_idx ON sick_leave_episodes (tenant_id, employee_id, started_on);

-- The ledger: the single source of truth for balances. Append-only — the
-- application never updates or deletes a row; corrections are reversal rows.
CREATE TABLE IF NOT EXISTS leave_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id),
  leave_type_id   uuid NOT NULL REFERENCES leave_types(id),
  policy_id       uuid REFERENCES leave_policies(id),
  entry_type      varchar(24) NOT NULL CHECK (entry_type IN (
                    'OPENING_BALANCE','OPENING_USAGE','ACCRUAL','ALLOTMENT','USAGE','USAGE_REVERSAL',
                    'ADJUSTMENT','ADJUSTMENT_REVERSAL','CARRY_FORWARD','EXPIRY','FORFEIT','PAYOUT')),
  units           numeric(7,2) NOT NULL,
  effective_date  date NOT NULL,
  cycle_key       varchar(40) NOT NULL,
  pay_tier        varchar(8),                    -- FULL | HALF | UNPAID (sick/maternity usage)
  source_type     varchar(16) NOT NULL,          -- REQUEST | ENGINE | OPENING_BATCH | ADJUSTMENT | TERMINATION | MIGRATION
  source_id       uuid,
  idem_key        varchar(200),                  -- makes engine postings idempotent
  reason_code     varchar(32),
  note            text,
  reverses_id     uuid REFERENCES leave_ledger(id),
  payroll_adjustment_id uuid,
  created_by      uuid,
  created_at      timestamp NOT NULL DEFAULT now(),
  CHECK (entry_type NOT IN ('ADJUSTMENT','ADJUSTMENT_REVERSAL') OR reason_code IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS leave_ledger_idem_uq ON leave_ledger (tenant_id, idem_key) WHERE idem_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leave_ledger_reversal_uq ON leave_ledger (reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leave_ledger_emp_idx ON leave_ledger (tenant_id, employee_id, leave_type_id, effective_date);

CREATE TABLE IF NOT EXISTS leave_opening_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  country_code    varchar(10) NOT NULL,
  cutover_date    date NOT NULL,
  status          varchar(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  file_name       varchar(255),
  line_count      int NOT NULL DEFAULT 0,
  error_count     int NOT NULL DEFAULT 0,
  uploaded_by     uuid,
  posted_by       uuid,
  posted_at       timestamp,
  reversed_at     timestamp,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS leave_opening_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id         uuid NOT NULL REFERENCES leave_opening_batches(id) ON DELETE CASCADE,
  row_number       int NOT NULL,
  employee_id      uuid REFERENCES employees(id),
  employee_code    varchar(40),
  leave_type_id    uuid REFERENCES leave_types(id),
  leave_code       varchar(32),
  balance          numeric(7,2),        -- ACCRUING: balance at cut-over
  used_this_cycle  numeric(7,2),        -- ALLOWANCE: already used in the cycle containing the cut-over
  sick_full_used   numeric(7,2),
  sick_half_used   numeric(7,2),
  sick_episode_start date,
  service_from     date,                -- optional: sets employees.continuous_service_from
  note             text,
  errors           jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS leave_opening_lines_batch_idx ON leave_opening_lines (batch_id);

-- ---------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leave_settings','work_schedules','tenant_holidays','leave_policies','leave_request_approvals',
    'leave_request_days','sick_leave_episodes','leave_ledger','leave_opening_batches','leave_opening_lines'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- drop the old cache
DROP TABLE IF EXISTS leave_balances;

-- ---------------------------------------------------------------- Zambia template (Employment Code Act No. 3 of 2019)
INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('ZM', 'ZM-ECA-2019.1', '2019-05-09', 'Employment Code Act No. 3 of 2019, ss.35–47; SI No. 48 of 2020 (exemptions)')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, v.statutory_min, v.section_ref, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Annual Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 24.00, 's.36', 10,
   '{"entitlement":24,"accrualFrequency":"MONTHLY","usableAfterMonths":6,"eligibleCategories":["PERMANENT","FIXED_TERM"],"excessAction":"CARRY_ALL","payoutOnTermination":true,"approvalFlow":["SUPERVISOR"],"description":"At least 2 days per month (s.36). Excludes temporary and casual employees. Accumulated leave is paid on termination (s.36(5))."}'),
  ('SICK', 'Sick Leave', 'EPISODE', 'WORKING_DAYS', 'PER_EPISODE', NULL, 's.38', 20,
   '{"payRules":{"SHORT":{"fullDays":26,"halfDays":26},"LONG":{"fullMonths":3,"halfMonths":3},"dischargeReviewMonths":6},"attachmentRequired":true,"attachmentFromUnits":1,"approvalFlow":["SUPERVISOR"],"description":"Short-term contract: 26 working days full pay then 26 half pay. Long-term: 3 months full pay then 3 months half pay. Medical certificate required (s.38)."}'),
  ('COMPASSIONATE', 'Compassionate Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', 12.00, 's.39', 30,
   '{"entitlement":12,"accrualFrequency":"UPFRONT","reasonRequired":true,"approvalFlow":["SUPERVISOR"],"description":"At least 12 days per calendar year on the death of a spouse, parent, child or dependant, or another justifiable ground (s.39)."}'),
  ('FAMILY_RESP', 'Family Responsibility Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', 7.00, 's.40(1)', 40,
   '{"entitlement":7,"accrualFrequency":"UPFRONT","minServiceMonths":6,"reasonRequired":true,"approvalFlow":["SUPERVISOR"],"description":"Up to 7 days per calendar year to care for a sick family member, after 6 months of service (s.40)."}'),
  ('FAMILY_CHILDCARE', 'Child / Dependant Care Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', 3.00, 's.40', 45,
   '{"entitlement":3,"accrualFrequency":"UPFRONT","minServiceMonths":6,"approvalFlow":["SUPERVISOR"],"description":"3 paid days per year for child or dependant care; does not reduce other leave (s.40)."}'),
  ('MATERNITY', 'Maternity Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 98.00, 's.41', 50,
   '{"entitlement":98,"genderRestriction":"FEMALE","attachmentRequired":true,"eventRules":{"multipleBirthExtraDays":28,"minDaysAfterDelivery":42,"nursingBreakMonths":6,"eventLabel":"Expected or actual delivery date"},"payRules":{"fullPayMinServiceMonths":24,"underServicePay":"FULL"},"approvalFlow":["HR"],"description":"14 weeks (+4 weeks for multiple births). Full pay after 24 months of continuous service (s.41). No return within 6 weeks of delivery without a medical certificate (s.42)."}'),
  ('PATERNITY', 'Paternity Leave', 'EVENT', 'WORKING_DAYS', 'PER_EVENT', 5.00, 's.46', 60,
   '{"entitlement":5,"genderRestriction":"MALE","minServiceMonths":12,"attachmentRequired":true,"eventRules":{"windowDaysAfterEvent":7,"continuous":true,"eventLabel":"Date of birth"},"approvalFlow":["SUPERVISOR"],"description":"At least 5 continuous working days within 7 days of the birth, after 12 months of service; birth record required (s.46)."}'),
  ('MOTHERS_DAY', 'Mother''s Day', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_MONTH', 1.00, 's.47', 70,
   '{"entitlement":1,"accrualFrequency":"UPFRONT","genderRestriction":"FEMALE","reasonAllowed":false,"approvalFlow":[],"prorate":false,"description":"One day each month for every female employee, with no medical certificate or reason required (s.47). Unused days lapse at month end."}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', NULL, NULL, 90,
   '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"],"description":"Unpaid time off by agreement. Deducted from pay."}')
) AS v(code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
WHERE t.country_code = 'ZM' AND t.version = 'ZM-ECA-2019.1'
ON CONFLICT (template_id, code) DO NOTHING;

-- Generic fallback for countries without a native template: same shapes,
-- zero entitlements — the tenant fills in the numbers in Settings → Leave.
INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('*', 'GENERIC-1', '2000-01-01', 'Generic structure — no statutory rules loaded for this country yet')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, NULL, NULL, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Annual Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 10, '{"entitlement":0,"accrualFrequency":"MONTHLY","approvalFlow":["SUPERVISOR"]}'),
  ('SICK', 'Sick Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', 20, '{"entitlement":0,"accrualFrequency":"UPFRONT","attachmentRequired":true,"attachmentFromUnits":2,"approvalFlow":["SUPERVISOR"]}'),
  ('COMPASSIONATE', 'Compassionate Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', 30, '{"entitlement":0,"accrualFrequency":"UPFRONT","approvalFlow":["SUPERVISOR"]}'),
  ('MATERNITY', 'Maternity Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 50, '{"entitlement":0,"genderRestriction":"FEMALE","approvalFlow":["HR"],"eventRules":{"eventLabel":"Expected or actual delivery date"}}'),
  ('PATERNITY', 'Paternity Leave', 'EVENT', 'WORKING_DAYS', 'PER_EVENT', 60, '{"entitlement":0,"genderRestriction":"MALE","approvalFlow":["SUPERVISOR"],"eventRules":{"eventLabel":"Date of birth"}}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', 90, '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"]}')
) AS v(code, name, kind, unit_basis, cycle, sort_order, defaults)
WHERE t.country_code = '*' AND t.version = 'GENERIC-1'
ON CONFLICT (template_id, code) DO NOTHING;

-- Zambian one-off holidays gazetted for 2026.
INSERT INTO public_holidays (country_code, holiday_date, name, source_ref) VALUES
  ('ZM', '2026-08-13', 'General Election Day', 'Declared public holiday, 2026 general elections'),
  ('ZM', '2026-09-01', 'Presidential Inauguration', 'Declared public holiday, 2026')
ON CONFLICT (country_code, holiday_date) DO NOTHING;

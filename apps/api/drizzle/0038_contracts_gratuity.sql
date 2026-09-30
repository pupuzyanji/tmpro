-- v028.F — Employment contracts and gratuity.
--
--   * employee_contracts: the dated contract record on the Job tab — the one
--     place a contract's type (as the Employment Code Act uses them:
--     Permanent (pensionable), Permanent (non-pensionable), Fixed-term,
--     Temporary, Casual), dates, pension scheme, gratuity rate, probation and
--     notice are kept. Leave rules and payroll read it (the employee's
--     employment_category / contract_term / contract_end_date columns are
--     kept in step with the current contract by the API).
--   * gratuity_settlements: one row per contract whose gratuity has been
--     paid, linking the payroll additions created for it.
--   * payroll_adjustments.taxable: a taxable addition is added to gross pay
--     before tax; a non-taxable one goes straight to net pay (the behaviour
--     every existing adjustment keeps).
--
-- Zambia (Employment Code Act s.73): a fixed-term contract of 12 months or
-- longer earns gratuity of at least 25% of the last-drawn basic pay (no
-- allowances or bonuses) × months served. The statutory 25% is paid tax-free;
-- anything an organisation pays above 25% is taxed through PAYE.

CREATE TABLE IF NOT EXISTS employee_contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type       varchar(28) NOT NULL CHECK (contract_type IN
                        ('PERMANENT_PENSIONABLE','PERMANENT_NON_PENSIONABLE','FIXED_TERM','TEMPORARY','CASUAL')),
  start_date          date NOT NULL,
  end_date            date,
  pension_scheme      varchar(120),
  gratuity_rate       numeric(5,2),
  probation_end_date  date,
  notice_period_days  integer,
  reference           varchar(80),
  notes               text,
  created_by          uuid,
  created_at          timestamp NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS employee_contracts_emp_idx ON employee_contracts (tenant_id, employee_id, start_date);

CREATE TABLE IF NOT EXISTS gratuity_settlements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_id       uuid NOT NULL UNIQUE REFERENCES employee_contracts(id) ON DELETE CASCADE,
  served_to         date NOT NULL,
  months            numeric(7,2) NOT NULL,
  basic_monthly     numeric(14,2) NOT NULL,
  rate              numeric(5,2) NOT NULL,
  tax_free_amount   numeric(14,2) NOT NULL,
  taxable_amount    numeric(14,2) NOT NULL,
  adjustment_ids    jsonb NOT NULL DEFAULT '[]',
  created_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gratuity_settlements_emp_idx ON gratuity_settlements (tenant_id, employee_id);

ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS taxable boolean NOT NULL DEFAULT false;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['employee_contracts','gratuity_settlements'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;

-- One contract per existing employee, from what tmPro already knows (the
-- v028.A leave-profile fields, else the employment type). Permanent staff
-- start as "non-pensionable" — mark pensionable staff on the Job tab.
--
-- Seeded one tenant at a time with app.current_tenant_id set, so the insert
-- satisfies the tenant_isolation policy when the migration runs as a normal
-- (non-superuser) database owner, where FORCE ROW LEVEL SECURITY applies.
DO $$
DECLARE tid uuid;
BEGIN
  FOR tid IN SELECT id FROM tenants
  LOOP
    PERFORM set_config('app.current_tenant_id', tid::text, true);
    INSERT INTO employee_contracts (tenant_id, employee_id, contract_type, start_date, end_date, gratuity_rate, notes)
    SELECT e.tenant_id,
           e.id,
           CASE
             WHEN e.employment_category = 'FIXED_TERM' THEN 'FIXED_TERM'
             WHEN e.employment_category = 'TEMPORARY' THEN 'TEMPORARY'
             WHEN e.employment_category = 'CASUAL' THEN 'CASUAL'
             WHEN e.employment_category IS NULL AND e.employment_type = 'CONTRACT' THEN 'FIXED_TERM'
             ELSE 'PERMANENT_NON_PENSIONABLE'
           END,
           COALESCE(e.continuous_service_from, e.start_date::date),
           e.contract_end_date,
           CASE
             WHEN e.country_code = 'ZM'
              AND (e.employment_category = 'FIXED_TERM' OR (e.employment_category IS NULL AND e.employment_type = 'CONTRACT'))
             THEN 25 ELSE NULL
           END,
           'Created by tmPro v028.F from the existing employee record — check the type and dates.'
    FROM employees e
    WHERE e.tenant_id = tid
      AND NOT EXISTS (SELECT 1 FROM employee_contracts c WHERE c.employee_id = e.id);
  END LOOP;
END $$;

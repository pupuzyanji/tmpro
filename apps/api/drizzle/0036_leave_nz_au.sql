-- v028.D — New Zealand and Australia leave rules on the v028.A engine.
-- Developer guide: docs/LEAVE-ENGINE.md; design notes: project doc
-- tmpro-leave-nz-au.md.
--
-- New policy options used here (no schema change — they live in the
-- existing jsonb columns):
--   payRules.entitlementWeeks       entitlement in weeks, × the person's working days a week
--   payRules.firstGrantAfterMonths  first up-front grant after N months, then every 12 months
--   payRules.maxBalance             an up-front grant only tops the balance up to this ceiling
--   payoutOnTermination = false     not paid out on leaving, and not counted as a liability
--
-- New Zealand follows the Holidays Act 2003, which stays in force until the
-- Employment Leave Bill (targeted for 2028) replaces it — add that as a new,
-- dated template version when it passes. Australia follows the National
-- Employment Standards (Fair Work Act 2009, Part 2-2).

-- ---------------------------------------------------------------- New Zealand
INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('NZ', 'NZ-HA-2003.1', '2021-07-24', 'Holidays Act 2003 (annual holidays s.16, sick and bereavement leave ss.63–72, family violence leave s.72B); Parental Leave and Employment Protection Act 1987; Te Kāhui o Matariki Public Holiday Act 2022')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, v.statutory_min, v.section_ref, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Annual Holidays', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 20.00, 's.16', 10,
   '{"entitlement":20,"accrualFrequency":"UPFRONT","prorate":false,"payRules":{"entitlementWeeks":4,"firstGrantAfterMonths":12},"excessAction":"CARRY_ALL","payoutOnTermination":true,"approvalFlow":["SUPERVISOR"],"description":"4 weeks of paid annual holidays after each 12 months of continuous employment (s.16), in working days for the person''s week. Leave in advance can be agreed. Someone leaving before their first 12 months is paid 8% of gross earnings instead (s.23) — work that out in payroll."}'),
  ('SICK', 'Sick Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 10.00, 's.63', 20,
   '{"entitlement":10,"accrualFrequency":"UPFRONT","prorate":false,"payRules":{"firstGrantAfterMonths":6,"maxBalance":20},"payoutOnTermination":false,"attachmentRequired":true,"attachmentFromUnits":2,"approvalFlow":["SUPERVISOR"],"description":"10 days after 6 months of current continuous employment, and 10 more every 12 months after that, for the employee''s own sickness or to care for a partner or dependant (s.63). Unused days carry over up to a total of 20. Proof can be asked for after 3 or more consecutive days. Not paid out on leaving."}'),
  ('BEREAVEMENT', 'Bereavement Leave', 'EVENT', 'WORKING_DAYS', 'PER_EVENT', 3.00, 's.69', 30,
   '{"entitlement":3,"minServiceMonths":6,"eventRules":{"eventLabel":"Date of death or loss"},"approvalFlow":["SUPERVISOR"],"description":"3 days on the death of a spouse or partner, parent, child, sibling, grandparent, grandchild or the spouse''s or partner''s parent, and after a miscarriage or stillbirth (s.69). After 6 months of employment."}'),
  ('BEREAVEMENT_OTHER', 'Bereavement Leave (other)', 'EVENT', 'WORKING_DAYS', 'PER_EVENT', 1.00, 's.69(2)(b)', 35,
   '{"entitlement":1,"minServiceMonths":6,"eventRules":{"eventLabel":"Date of death"},"approvalFlow":["SUPERVISOR"],"description":"1 day on the death of anyone else, if the employer accepts the employee has suffered a bereavement (s.69). After 6 months of employment."}'),
  ('FAMILY_VIOLENCE', 'Family Violence Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 10.00, 's.72B', 40,
   '{"entitlement":10,"accrualFrequency":"UPFRONT","prorate":false,"payRules":{"firstGrantAfterMonths":6,"maxBalance":10},"payoutOnTermination":false,"reasonAllowed":false,"approvalFlow":["HR"],"description":"10 days a year after 6 months of employment, for an employee affected by family violence (s.72B). Does not accumulate. No reason is asked; requests go to HR only."}'),
  ('PARENTAL', 'Parental Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 182.00, 'PLEPA s.7', 50,
   '{"entitlement":182,"paid":false,"minServiceMonths":6,"eventRules":{"eventLabel":"Expected or actual birth (or placement) date"},"approvalFlow":["HR"],"description":"Up to 26 weeks of primary carer leave. The government pays parental leave payments through Inland Revenue, so it is unpaid by the employer. Extended leave up to 52 weeks in total can be booked as unpaid leave."}'),
  ('PARTNER', 'Partner''s Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 14.00, 'PLEPA s.19', 60,
   '{"entitlement":14,"paid":false,"minServiceMonths":6,"eventRules":{"eventLabel":"Date of birth (or placement)"},"approvalFlow":["SUPERVISOR"],"description":"Unpaid partner''s leave around the birth: 2 weeks after 12 months of employment, 1 week after 6 months."}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', NULL, NULL, 90,
   '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"],"description":"Unpaid time off by agreement. Deducted from pay."}')
) AS v(code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
WHERE t.country_code = 'NZ' AND t.version = 'NZ-HA-2003.1'
ON CONFLICT (template_id, code) DO NOTHING;

-- ---------------------------------------------------------------- Australia
INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('AU', 'AU-NES-2009.2026', '2026-07-01', 'Fair Work Act 2009 (Cth), National Employment Standards: annual leave s.87, personal/carer''s and compassionate leave ss.96–104, family and domestic violence leave s.106A, parental leave s.70, public holidays s.114')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, v.statutory_min, v.section_ref, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Annual Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 20.00, 's.87', 10,
   '{"entitlement":20,"accrualFrequency":"MONTHLY","payRules":{"entitlementWeeks":4},"eligibleCategories":["PERMANENT","FIXED_TERM","TEMPORARY"],"excessAction":"CARRY_ALL","payoutOnTermination":true,"approvalFlow":["SUPERVISOR"],"description":"4 weeks a year (5 for shift workers under an award or agreement), accruing progressively and carrying over; paid out on termination (s.87, s.90). Casual employees are excluded. Leave loading comes from the award, not the NES."}'),
  ('PERSONAL', 'Personal/Carer''s Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 10.00, 's.96', 20,
   '{"entitlement":10,"accrualFrequency":"MONTHLY","payRules":{"entitlementWeeks":2},"eligibleCategories":["PERMANENT","FIXED_TERM","TEMPORARY"],"payoutOnTermination":false,"approvalFlow":["SUPERVISOR"],"description":"10 days a year for full-time staff (2 weeks of ordinary hours, pro rata for part-time), accruing progressively and carrying over, for personal illness or to care for a family or household member (s.96). Not paid out on leaving. Casual employees are excluded (they get 2 days unpaid carer''s leave per occasion)."}'),
  ('COMPASSIONATE', 'Compassionate Leave', 'EVENT', 'WORKING_DAYS', 'PER_EVENT', 2.00, 's.104', 30,
   '{"entitlement":2,"eventRules":{"eventLabel":"Date of death, injury or diagnosis"},"approvalFlow":["SUPERVISOR"],"description":"2 days each time a family or household member dies or has a life-threatening illness or injury, or after a stillbirth or miscarriage (s.104). Paid for permanent staff; unpaid for casuals."}'),
  ('FAMILY_VIOLENCE', 'Family & Domestic Violence Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 10.00, 's.106A', 40,
   '{"entitlement":10,"accrualFrequency":"UPFRONT","prorate":false,"payRules":{"maxBalance":10},"payoutOnTermination":false,"reasonAllowed":false,"approvalFlow":["HR"],"description":"10 days of paid leave each 12 months, available in full from the start, including for casual employees (s.106A). Does not accumulate. No reason is asked; requests go to HR only."}'),
  ('PARENTAL', 'Parental Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 365.00, 's.70', 50,
   '{"entitlement":365,"paid":false,"minServiceMonths":12,"eventRules":{"eventLabel":"Expected or actual birth (or placement) date"},"approvalFlow":["HR"],"description":"Up to 12 months of unpaid parental leave after 12 months of service (s.70), with a right to request 12 more. Parental Leave Pay (26 weeks from 1 July 2026) is paid by the government, not the employer."}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', NULL, NULL, 90,
   '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"],"description":"Unpaid time off by agreement, including unpaid carer''s leave for casuals and community service leave. Deducted from pay."}')
) AS v(code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
WHERE t.country_code = 'AU' AND t.version = 'AU-NES-2009.2026'
ON CONFLICT (template_id, code) DO NOTHING;

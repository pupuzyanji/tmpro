-- v028.C — Malawi leave rules on the v028.A engine. Design and decisions:
-- project doc tmpro-leave-malawi.md; developer guide docs/LEAVE-ENGINE.md.
--
-- What changes:
--   * leave_policies.entitlement_by_week: an entitlement that depends on the
--     employee's work week (Malawi s.44: 18 days on a 6-day week, 15 on a 5-
--     or 5½-day week).
--   * The Malawi template MW-EA-2000.2021 (Employment Act No. 6 of 2000 as
--     amended by Act No. 17 of 2021):
--       - annual leave accrued monthly, flagged when not taken within
--         6 months of falling due (payRules.useWithinMonths);
--       - sick leave as a yearly pot after 12 months' service: 4 weeks full
--         pay then 8 weeks half pay (payRules.mode = YEARLY); unpaid before;
--       - maternity 8 weeks and paternity 2 weeks (s.47A, inserted 2021) on
--         full pay, each once every 3 years (eventRules.recurrenceYears);
--       - compassionate, family responsibility, study and wedding leave as
--         company types (no statutory minimum), 5 working days a year each.
--   * Malawi public holidays are generated in code (engine/holidays.ts).
--     Tenants with Malawi employees are provisioned (or their earlier
--     name-converted types upgraded) by the API on start-up.

ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS entitlement_by_week jsonb;

INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('MW', 'MW-EA-2000.2021', '2021-01-01', 'Employment Act No. 6 of 2000 (Cap. 55:01), ss.36, 40, 44–47A, as amended by the Employment (Amendment) Act No. 17 of 2021')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, v.statutory_min, v.section_ref, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Annual Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 15.00, 's.44', 10,
   '{"entitlement":15,"entitlementByWeek":[{"minDays":6,"entitlement":18}],"accrualFrequency":"MONTHLY","excessAction":"CARRY_ALL","payoutOnTermination":true,"payRules":{"useWithinMonths":6},"approvalFlow":["SUPERVISOR"],"description":"At least 15 working days a year on a 5- or 5½-day week, 18 on a 6-day week, on full pay (s.44). To be taken within 6 months of falling due unless deferred by agreement — tmPro flags overdue leave. Accrued leave is paid on termination (s.45)."}'),
  ('SICK', 'Sick Leave', 'EPISODE', 'WORKING_DAYS', 'PER_EPISODE', NULL, 's.46', 20,
   '{"payRules":{"mode":"YEARLY","fullWeeks":4,"halfWeeks":8,"minServiceMonths":12,"section":"s.46"},"attachmentRequired":true,"approvalFlow":["SUPERVISOR"],"description":"After 12 months of continuous service: 4 weeks on full pay and then 8 weeks on half pay in each service year, with a medical certificate (s.46). Unpaid in the first 12 months (company rule)."}'),
  ('MATERNITY', 'Maternity Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 56.00, 's.47', 50,
   '{"entitlement":56,"genderRestriction":"FEMALE","attachmentRequired":true,"eventRules":{"recurrenceYears":3,"eventLabel":"Expected or actual delivery date"},"approvalFlow":["HR"],"description":"At least 8 weeks on full pay, once in every 3 years; benefits and service continue unbroken (s.47). A second maternity leave within 3 years is unpaid unless the organisation decides otherwise."}'),
  ('PATERNITY', 'Paternity Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 14.00, 's.47A', 60,
   '{"entitlement":14,"genderRestriction":"MALE","eventRules":{"recurrenceYears":3,"eventLabel":"Date of birth"},"approvalFlow":["SUPERVISOR"],"description":"At least 2 weeks on full pay, once every 3 years; benefits and service continue unbroken (s.47A, inserted by the Employment (Amendment) Act 2021)."}'),
  ('COMPASSIONATE', 'Compassionate Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', NULL, NULL, 30,
   '{"entitlement":5,"accrualFrequency":"UPFRONT","reasonRequired":true,"approvalFlow":["SUPERVISOR"],"description":"Company leave — not set by the Employment Act. Default 5 working days a calendar year; change it to match your policy or collective agreement."}'),
  ('FAMILY_RESP', 'Family Responsibility Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', NULL, NULL, 40,
   '{"entitlement":5,"accrualFrequency":"UPFRONT","reasonRequired":true,"approvalFlow":["SUPERVISOR"],"description":"Company leave — not set by the Employment Act. Default 5 working days a calendar year to care for a family member."}'),
  ('STUDY', 'Study Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', NULL, NULL, 70,
   '{"entitlement":5,"accrualFrequency":"UPFRONT","approvalFlow":["SUPERVISOR"],"description":"Company leave — not set by the Employment Act. Default 5 working days a calendar year for exams and study."}'),
  ('WEDDING', 'Wedding Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', NULL, NULL, 75,
   '{"entitlement":5,"accrualFrequency":"UPFRONT","approvalFlow":["SUPERVISOR"],"description":"Company leave — not set by the Employment Act. Default 5 working days a calendar year for the employee''s own wedding."}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', NULL, NULL, 90,
   '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"],"description":"Unpaid time off by agreement. Deducted from pay."}')
) AS v(code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
WHERE t.country_code = 'MW' AND t.version = 'MW-EA-2000.2021'
ON CONFLICT (template_id, code) DO NOTHING;

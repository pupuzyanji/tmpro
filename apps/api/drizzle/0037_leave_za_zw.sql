-- v028.E — South Africa and Zimbabwe leave rules on the v028.A engine.
-- Developer guide: docs/LEAVE-ENGINE.md; notes: project doc tmpro-leave-za-zw.md.
--
-- New policy options used here (jsonb, no schema change):
--   payRules.mode = "YEARLY" with cycleYears (SA: a 36-month sick cycle),
--     fullDays/halfDays instead of weeks (Zimbabwe: 90 + 90 days), and
--     earlyMonths/earlyDivisor (SA: 1 day per 26 worked in the first 6 months)
--   payRules.maxBalance on a monthly-accruing type: accrual pauses at the
--     ceiling (Zimbabwe vacation leave: 90 days)
--   payRules.minDaysPerWeek: eligibility by working week (SA family
--     responsibility leave: 4 days a week or more)

-- ---------------------------------------------------------------- South Africa
INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('ZA', 'ZA-BCEA-1997.2025', '2025-10-03', 'Basic Conditions of Employment Act 75 of 1997, ss.20–27 (annual, sick, parental and family responsibility leave), as read with Van Wyk v Minister of Employment and Labour [2025] ZACC 20 (parental leave); Public Holidays Act 36 of 1994')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, v.statutory_min, v.section_ref, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Annual Leave', 'ACCRUING', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 15.00, 's.20', 10,
   '{"entitlement":15,"accrualFrequency":"MONTHLY","payRules":{"entitlementWeeks":3,"useWithinMonths":6},"excessAction":"CARRY_ALL","payoutOnTermination":true,"approvalFlow":["SUPERVISOR"],"description":"21 consecutive days a year — 15 working days on a 5-day week, 18 on a 6-day week (s.20(2)). To be taken within 6 months of the end of the leave cycle; tmPro flags overdue leave. Accrued leave is paid on termination (s.40)."}'),
  ('SICK', 'Sick Leave', 'EPISODE', 'WORKING_DAYS', 'PER_EPISODE', NULL, 's.22', 20,
   '{"payRules":{"mode":"YEARLY","cycleYears":3,"fullWeeks":6,"halfWeeks":0,"earlyMonths":6,"earlyDivisor":26,"section":"s.22"},"attachmentRequired":true,"attachmentFromUnits":2,"approvalFlow":["SUPERVISOR"],"description":"In each 36-month cycle, paid sick leave equal to the days normally worked in 6 weeks — 30 days on a 5-day week (s.22(2)). In the first 6 months, 1 paid day for every 26 days worked (s.22(3)). A medical certificate can be required for more than 2 consecutive days or twice in 8 weeks (s.23)."}'),
  ('FAMILY_RESP', 'Family Responsibility Leave', 'ALLOWANCE', 'WORKING_DAYS', 'EMPLOYMENT_ANNIVERSARY', 3.00, 's.27', 30,
   '{"entitlement":3,"accrualFrequency":"UPFRONT","minServiceMonths":4,"payRules":{"minDaysPerWeek":4},"reasonRequired":true,"approvalFlow":["SUPERVISOR"],"description":"3 paid days each leave cycle, after 4 months of employment, for employees who work at least 4 days a week: when a child is sick, or on the death of a spouse or partner, parent, adoptive parent, grandparent, child, adopted child, grandchild or sibling (s.27). Unused days lapse."}'),
  ('PARENTAL', 'Parental Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 132.00, 's.25 (Van Wyk)', 50,
   '{"entitlement":132,"paid":false,"attachmentRequired":true,"eventRules":{"eventLabel":"Expected or actual birth (or adoption) date"},"approvalFlow":["HR"],"description":"Since Van Wyk (3 October 2025): at least 4 consecutive months of unpaid parental leave for a sole employed parent; where both parents are employed they share 4 months and 10 days between them. A birth mother may start up to 4 weeks before the birth and may not work for 6 weeks after it without a medical certificate. Unpaid by the employer — UIF benefits may apply. Check the parents'' split when approving."}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', NULL, NULL, 90,
   '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"],"description":"Unpaid time off by agreement. Deducted from pay."}')
) AS v(code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
WHERE t.country_code = 'ZA' AND t.version = 'ZA-BCEA-1997.2025'
ON CONFLICT (template_id, code) DO NOTHING;

-- ---------------------------------------------------------------- Zimbabwe
INSERT INTO leave_rule_templates (country_code, version, effective_from, legal_basis)
VALUES ('ZW', 'ZW-LA-28.01.2023', '2023-06-01', 'Labour Act [Chapter 28:01], ss.14 (sick), 14A (vacation), 14B (special) and 18 (maternity), as amended by the Labour Amendment Act 2023; Public Holidays and Prohibition of Business Act [Chapter 10:21]')
ON CONFLICT (country_code, version) DO NOTHING;

INSERT INTO leave_rule_template_items (template_id, code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
SELECT t.id, v.code, v.name, v.kind, v.unit_basis, v.cycle, v.statutory_min, v.section_ref, v.sort_order, v.defaults::jsonb
FROM leave_rule_templates t,
(VALUES
  ('ANNUAL', 'Vacation Leave', 'ACCRUING', 'CALENDAR_DAYS', 'EMPLOYMENT_ANNIVERSARY', 30.00, 's.14A', 10,
   '{"entitlement":30,"accrualFrequency":"MONTHLY","payRules":{"maxBalance":90},"excessAction":"CARRY_ALL","payoutOnTermination":true,"approvalFlow":["SUPERVISOR"],"description":"One twelfth of qualifying service — 30 calendar days (about 22 working days) a year (s.14A). Weekends and public holidays inside a period of vacation leave count as leave days. Leave accumulates to a maximum of 90 days and then stops accruing until some is taken. Accrued leave is paid on termination."}'),
  ('SICK', 'Sick Leave', 'EPISODE', 'CALENDAR_DAYS', 'PER_EPISODE', NULL, 's.14', 20,
   '{"payRules":{"mode":"YEARLY","cycleYears":1,"fullDays":90,"halfDays":90,"section":"s.14"},"attachmentRequired":true,"approvalFlow":["SUPERVISOR"],"description":"Up to 90 days on full pay in each year of service with a medical certificate, then up to a further 90 days on half pay (s.14). After 180 days the employer may terminate on medical grounds."}'),
  ('MATERNITY', 'Maternity Leave', 'EVENT', 'CALENDAR_DAYS', 'PER_EVENT', 98.00, 's.18', 50,
   '{"entitlement":98,"genderRestriction":"FEMALE","attachmentRequired":true,"eventRules":{"eventLabel":"Expected or actual delivery date"},"approvalFlow":["HR"],"description":"98 days on full pay. Since the Labour Amendment Act 2023 there is no minimum service and no limit on how many times it can be taken; fixed-term employees are covered too (s.18)."}'),
  ('SPECIAL', 'Special Leave', 'ALLOWANCE', 'WORKING_DAYS', 'CALENDAR_YEAR', 12.00, 's.14B', 30,
   '{"entitlement":12,"accrualFrequency":"UPFRONT","reasonRequired":true,"approvalFlow":["SUPERVISOR"],"description":"Up to 12 days of paid special leave in a calendar year — for example a court subpoena, or the death of a spouse, parent, child or legal dependant (s.14B). Unused days lapse."}'),
  ('UNPAID', 'Unpaid Leave', 'UNTRACKED', 'WORKING_DAYS', 'NONE', NULL, NULL, 90,
   '{"paid":false,"reasonRequired":true,"approvalFlow":["SUPERVISOR","HR"],"description":"Unpaid time off by agreement (s.14A(5)). Deducted from pay."}')
) AS v(code, name, kind, unit_basis, cycle, statutory_min, section_ref, sort_order, defaults)
WHERE t.country_code = 'ZW' AND t.version = 'ZW-LA-28.01.2023'
ON CONFLICT (template_id, code) DO NOTHING;

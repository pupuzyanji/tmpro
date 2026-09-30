# tmPro leave engine (v028.A; Malawi v028.C; New Zealand and Australia v028.D; South Africa and Zimbabwe v028.E)

A ledger-based leave engine. It replaces the v014 model, where balances were recomputed on every read from each type's days, period and carry-over settings. The design rationale and the Zambian legal research are in the project doc `tmpro-leave-zambia.md`.

## Concepts

| Concept | Where | What it is |
|---|---|---|
| Country template | `leave_rule_templates`, `leave_rule_template_items` (platform, no tenant) | The statutory rule set for a country: Zambia `ZM-ECA-2019.1` (migration `0034`), Malawi `MW-EA-2000.2021` (migration `0035`), New Zealand `NZ-HA-2003.1` and Australia `AU-NES-2009.2026` (migration `0036`), South Africa `ZA-BCEA-1997.2025` and Zimbabwe `ZW-LA-28.01.2023` (migration `0037`). `*` is the generic fallback. |
| Leave type | `leave_types` (tenant) | How a type behaves: `kind`, counting basis (`unit_basis`), gender, reason and attachment rules, approval flow. |
| Policy | `leave_policies` (tenant) | The numbers, **effective-dated**. A change closes the current version (`effective_to`) and opens a new one, so past accruals keep the rule that applied then. |
| Ledger | `leave_ledger` (tenant) | **Single source of truth.** Append-only. Balance = sum of entries. Corrections are reversal rows (`reverses_id`). |
| Request days | `leave_request_days` | One row per counted day of a request: units and pay factor (1 / 0.5 / 0). **Payroll reads this.** |
| Sick episodes | `sick_leave_episodes` | Full-pay, half-pay and unpaid counters per illness. |
| Opening batches | `leave_opening_batches`, `leave_opening_lines` | Balances brought forward when an organisation moves onto tmPro. |
| Calendar | `engine/holidays.ts`, `public_holidays`, `tenant_holidays`, `work_schedules` | National holidays are generated in code (Zambia incl. the Sunday→Monday rule). Gazetted one-offs, company closures and per-employee work weeks are stored in the tables. |

The five kinds of leave:
- **ACCRUING**: annual leave. Monthly accrual on the anniversary cycle. Carry-forward cap and excess handling apply at each anniversary. Payout on termination.
- **ALLOWANCE**: compassionate, family, Mother's Day. Granted in full per calendar year or month; the remainder lapses at the end of the period.
- **EVENT**: maternity, paternity. Granted per birth, with a window and multiple-birth extension.
- **EPISODE**: sick leave. Two modes, set in the policy's `payRules`:
  - per illness, by contract term (Zambia s.38);
  - `mode: "YEARLY"` (Malawi s.46): a pot per service year of `fullWeeks` on full pay then `halfWeeks` on half pay, converted to working days for the person's week, available after `minServiceMonths` (unpaid before).
- **UNTRACKED**: unpaid and other leave. No balance.

## Rule options added in v028.C

- `leave_policies.entitlement_by_week`: an entitlement that depends on the work week, e.g. `[{"minDays": 6, "entitlement": 18}]`. The highest `minDays` the person's week reaches wins; otherwise `entitlement` applies. A 5½-day week counts as 5.5, so it gets the base entitlement (Malawi: 15).
- `payRules.useWithinMonths` on an accruing type: leave not taken within N months of the anniversary it fell due on is **flagged** (leave card, Reports → Overdue annual leave). Nothing is forfeited.
- `eventRules.recurrenceYears` on an event type: a second event starting within N years of the last one is allowed but **unpaid** (pay factor 0), with a warning in the preview, so HR can decide.
- Template items with no `statutory_min` and no section are company leave types (Malawi compassionate, family responsibility, study, wedding: 5 days by default).
- Upgrading a country that gains a template: types converted by name earlier (code = slug of the name, no template item) are converted in place. If they already have ledger history, the old policy is closed yesterday, the template policy starts today, and accruing types get a zero opening balance for everyone in that country, so the balance so far is carried and history is not replayed under the new rules. Company types keep the number the organisation set.

## Rule options added in v028.D

- `payRules.entitlementWeeks`: the entitlement in weeks, multiplied by the person's working days a week. A part-timer on 3 days gets 12 days for 4 weeks. It takes precedence over `entitlement` and `entitlement_by_week`.
- `payRules.firstGrantAfterMonths` on an `UPFRONT` accruing type: the first grant comes N months after service start, then every 12 months from there. Examples: NZ annual holidays at 12 months; NZ sick and family violence leave at 6.
- `payRules.maxBalance` on an `UPFRONT` type: each grant only tops the balance up to this ceiling. NZ sick leave is 10 a year to a maximum of 20; family violence leave (NZ, AU) is 10, not cumulative. When capped, the ledger entry says so.
- `payoutOnTermination: false`: not paid out on leaving, and left out of the leave-liability report (NZ sick, AU personal and family violence leave).
- A non-paid `EVENT` type (NZ/AU parental leave, NZ partner's leave) is booked with pay factor 0, so payroll deducts it. Government parental payments are outside tmPro.
- Holidays: NZ (Mondayisation, with Matariki dates from the 2022 Act through 2052) and AU (the holidays common to every state; ANZAC Day not moved). State and regional holidays are added by each organisation.
- Legacy names are mapped per country (`LEGACY_BY_COUNTRY` in `provision.ts`). For example, AU "Sick Leave" becomes PERSONAL, and NZ "Paternity Leave" becomes PARTNER.

## Rule options added in v028.E

- The sick pot (`payRules.mode = "YEARLY"`) gains three options:
  - `cycleYears`: SA s.22 counts sick leave in 36-month cycles from the service start.
  - `fullDays` / `halfDays`: caps given directly in days rather than weeks (Zimbabwe s.14: 90 + 90).
  - `earlyMonths` / `earlyDivisor`: in the first N months only 1 paid day is earned per D days worked (SA: 6 and 26). Days worked are approximated from calendar time and the person's working week.
- `payRules.maxBalance` also works on monthly accruals: accrual pauses at the ceiling, and the ledger entry says so (Zimbabwe vacation leave: 90 days).
- `payRules.minDaysPerWeek`: a type applies only to people whose week reaches N working days (SA family responsibility leave: 4).
- Maternity's return warning quotes `eventRules.returnRuleRef` (default `s.42`, Zambia).
- Holidays: SA and Zimbabwe (a Sunday holiday moves to Monday; Saturdays don't move).
- Legacy names are mapped per country:
  - SA "Compassionate/Special Leave" becomes FAMILY_RESP, "Maternity Leave" becomes PARENTAL, and "Paternity Leave" is merged into PARENTAL.
  - Zimbabwe "Compassionate/Special Leave" becomes SPECIAL.

## Code map (`apps/api/src/modules/leave/`)

- `engine/dates.ts`: calendar-date helpers (plain `YYYY-MM-DD` strings, so there are no timezone shifts).
- `engine/holidays.ts`: holiday generation and lookup (Zambia: Sunday → Monday; Malawi: Saturday or Sunday → next working day, cascading).
- `engine/compliance.ts` (v028.C): overdue annual leave, "once every N years" event checks, and yearly sick-pot usage.
- `engine/context.ts`: employee context, regime lookup and policy resolution.
  - Context: service start, category, contract term, work week, leaving date.
  - Regime: the employee's country if the tenant has types for it, else `OTHER`.
  - Policy resolution: `policyOn(date)`.
  - Daily pay rate.
- `engine/calendar.ts`: `countUnits()` works out working/calendar days after the work week, holidays and half days.
- `engine/ledger.ts`: `post()` (idempotent through `idem_key`), balances, cycle keys.
- `engine/process.ts`: `processEmployee(asOf)`. Idempotent periodic postings:
  - accruals;
  - allowance grants and lapses;
  - cycle-end cap (payout, or forfeit only with an exemption);
  - termination payout, which creates a payroll ADDITION.
- `engine/evaluate.ts`: `evaluate()` checks a request. The same code backs preview, submit and final approval. It checks eligibility, overlap, balance (with projected accrual) or cycle remainder or event window, and works out sick tiers and pay factors.
- `engine/provision.ts`: `ensureTenantLeave()` sets up a tenant from templates and converts pre-v028 data:
  - legacy Zambian types are mapped to codes, and "Sick – Short-term" is merged into SICK;
  - other countries keep their old numbers as the first policy version;
  - every legacy APPROVED request becomes a ledger USAGE entry plus day rows.
- `engine/opening.ts`: opening-balance template, CSV validation, posting and reversal. A posted line sets the balance as at the cut-over; the engine posts the difference and never accrues on or before the cut-over.
- `leave.service.ts` / `leave.controller.ts`: HTTP layer. Admin endpoints are under `/api/leave/admin/*`.

## When processing runs

- Shortly after API start-up, for every tenant. This also provisions and converts legacy data.
- Every 6 hours (`LEAVE_SCHEDULER=off` disables both).
- Whenever an employee's leave is read (overview, ledger, preview).
- Settings → Leave → Processing → "Run leave processing now".

Every posting is keyed, so re-running is always safe.

## Payroll

`buildProratedComponents()` multiplies each day's earnings by the lowest pay factor among APPROVED requests covering that day:
- unpaid leave, and unpaid sick days beyond the tiers: 0;
- half-pay sick days: 0.5;
- maternity without the service for full pay: per policy (default full).

Leave payouts (termination, or excess above a cap) are `payroll_adjustments` ADDITIONs that are applied on the next run.

## Adding a country

1. Insert a `leave_rule_templates` row and its items: codes, kinds, cycles, `statutory_min` and `defaults` JSON. Use the ZM rows in `0034_leave_engine.sql` as the model.
2. Add a holiday generator in `engine/holidays.ts` (`GENERATORS`).
3. On next start-up, tenants with employees in that country are provisioned from the template. Existing legacy types are converted in place, matched by the slug of their name.

## Open legal points (confirm before relying on them)

South Africa:
- Parental leave follows the interim Van Wyk order. The split between two employed parents (4 months and 10 days in total) isn't enforced: HR checks it on approval. Parliament is expected to legislate; add that as a new template version when it does.
- Annual leave by agreement at 1 day per 17 days worked, sectoral determinations and bargaining-council agreements are not modelled.

Zimbabwe:
- Sick leave's second 90 days at half pay are applied automatically. Check this against your collective bargaining agreement.
- There is no statutory paternity leave; add a company type if you give one. NSSA maternity benefits are outside tmPro.


New Zealand:
- Holiday pay (greater of ordinary weekly pay and average weekly earnings), the 8% payout for someone leaving in their first year, and alternative holidays for working on a public holiday are payroll matters and are not calculated here.
- Partner's leave is 2 weeks after 12 months but only 1 week after 6 months. tmPro allows 14 days from 6 months, so HR checks the shorter case.
- The Employment Leave Bill (targeted for 2028) will replace the Holidays Act. Add it as a new template version when enacted.

Australia:
- Awards and enterprise agreements add to the NES (leave loading, a fifth week for shift workers). Long service leave is state law. Neither is included.
- Casuals' compassionate leave is unpaid, but the template books it as paid. HR changes the pay case by case.


Malawi:
- Section 7 of the Employment (Amendment) Act 2021 (the clause just before s.47A) ends "…recommended by the registered medical practitioner". Its full text is still to be checked; it probably extends sick or maternity leave on medical advice.
- "Two weeks" of paternity leave is counted as 14 calendar days, like maternity's 8 weeks (56 days).
- Eid al-Fitr is not generated; add it each year as a gazetted or company holiday.

Zambia:

- The Fifth Schedule leave-pay formula. The default daily rate is monthly basic ÷ 26, configurable.
- Maternity pay under 24 months' service. The default is full pay (`payRules.underServicePay`).
- Sick-episode linking. The default is 14 days, configurable.
- Annual leave in the first 12 months. The default accrues from the start and is usable after 6 months (`usableAfterMonths`).

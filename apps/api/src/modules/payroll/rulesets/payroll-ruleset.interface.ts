/**
 * The pluggable country interface described in the framework doc (Sheet 07):
 * the payroll engine calls this without knowing which country it's talking
 * to. ZM (Zambia) is this build's default native ruleset; NZ is implemented
 * alongside it as a second native pattern example and stays selectable on
 * every payroll run. Every other country is expected to come from a
 * "Partnered" ruleset that wraps a global-payroll API partner (Deel/Remote/
 * Papaya) behind this same shape, not from tmPro re-implementing that
 * country's tax law.
 */
export interface PayrollCalculationInput {
  kiwiSaverRate?: number | null;
  periodDays: number;
  /** The pay-period earnings breakdown every native ruleset reads from —
   *  `basicSalary`, `housingAllowance`, `transportAllowance`,
   *  `lunchAllowance`, `otherAllowance`. PayrollService builds this by
   *  resolving what was actually in effect on each calendar day of the
   *  period (status, Compensation entry, unpaid leave) and summing each
   *  day's share — see `buildProratedComponents` in payroll.service.ts —
   *  rather than one flat snapshot as of the period's end, so it already
   *  reflects any new hire/leaver/mid-period change/unpaid leave for this
   *  employee. A ruleset sums whichever of these it needs for gross pay
   *  and applies its own country-specific tax/statutory math on top. */
  components: Record<string, number>;
}

export interface PayrollCalculationResult {
  grossPay: number;
  tax: number;
  deductions: number;
  netPay: number;
  /** Ruleset-specific breakdown for payslip display — shape varies by
   *  country (e.g. ZM: { earnings: {...}, statutory: {...} }). Omitted or
   *  empty for rulesets that don't need a line-item payslip. */
  components?: Record<string, unknown>;
}

export interface PayrollRuleset {
  countryCode: string;
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult;
}

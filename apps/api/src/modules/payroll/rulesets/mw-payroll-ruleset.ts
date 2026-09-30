import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';
import { Band, earningsOf, periodMonths, progressive, round2 } from './common';

/**
 * Malawi — v029.A (rates in force from 1 January 2026).
 *
 * PAYE (Taxation Act, as amended from 1 January 2026), monthly, MWK:
 *   first K170,000            0%
 *   K170,001 – K1,570,000     30%
 *   K1,570,001 – K10,000,000  35%
 *   above K10,000,000         40%
 * PAYE is worked out on gross pay (basic, allowances and taxable additions).
 *
 * Pension Act 2023 (mandatory occupational pension): the employee pays at
 * least 5% and the employer at least 10% of pensionable emoluments — basic
 * pay here. The employer's 10% is shown on the payslip and not deducted.
 *
 * Monthly bands and figures apply as published on a monthly run and are
 * scaled for other period lengths.
 */
const MW_PAYE_BANDS_2026: Band[] = [
  { upTo: 170_000, rate: 0 },
  { upTo: 1_570_000, rate: 0.3 },
  { upTo: 10_000_000, rate: 0.35 },
  { upTo: Infinity, rate: 0.4 },
];

const PENSION_EMPLOYEE = 0.05;
const PENSION_EMPLOYER = 0.1;

export const mwPayrollRuleset: PayrollRuleset = {
  countryCode: 'MW',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const { earnings, grossPay } = earningsOf(input);
    const months = periodMonths(input);
    const bands = MW_PAYE_BANDS_2026.map((b) => ({ ...b, upTo: b.upTo * months }));

    const paye = round2(progressive(bands, grossPay));
    const pension = round2(earnings.basicSalary * PENSION_EMPLOYEE);
    const employerPension = round2(earnings.basicSalary * PENSION_EMPLOYER);
    const deductions = pension;

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay: round2(grossPay - paye - deductions),
      components: {
        currency: 'MWK',
        earnings,
        statutory: { paye, pension },
        employer: { employerPension },
      },
    };
  },
};

import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';
import { Band, earningsOf, periodMonths, progressive, round2 } from './common';

/**
 * Zimbabwe — v029.A. USD payroll (formal-sector Zimbabwe payroll is mostly
 * run in USD; a ZiG table is not modelled here).
 *
 * PAYE, ZIMRA USD monthly table (Income Tax Act [Chapter 23:06]):
 *   0 – 100          0%
 *   100.01 – 300     20%
 *   300.01 – 1,000   25%
 *   1,000.01 – 2,000 30%
 *   2,000.01 – 3,000 35%
 *   above 3,000      40%
 * AIDS levy: 3% of the PAYE worked out.
 *
 * NSSA (Pension and Other Benefits Scheme): 4.5% employee + 4.5% employer
 * on insurable earnings up to USD 700 a month. The employee's NSSA
 * contribution is deducted from taxable income before PAYE.
 *
 * Personal tax credits (elderly, blind, disabled) are not applied — enter
 * them as a non-taxable addition if they apply.
 */
const ZW_PAYE_BANDS_USD: Band[] = [
  { upTo: 100, rate: 0 },
  { upTo: 300, rate: 0.2 },
  { upTo: 1_000, rate: 0.25 },
  { upTo: 2_000, rate: 0.3 },
  { upTo: 3_000, rate: 0.35 },
  { upTo: Infinity, rate: 0.4 },
];

const NSSA_RATE = 0.045;
const NSSA_CEILING_USD = 700; // insurable earnings a month
const AIDS_LEVY_RATE = 0.03;

export const zwPayrollRuleset: PayrollRuleset = {
  countryCode: 'ZW',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const { earnings, grossPay } = earningsOf(input);
    const months = periodMonths(input);

    const insurable = Math.min(grossPay, NSSA_CEILING_USD * months);
    const nssa = round2(insurable * NSSA_RATE);
    const employerNssa = nssa;

    const taxable = Math.max(0, grossPay - nssa);
    const bands = ZW_PAYE_BANDS_USD.map((b) => ({ ...b, upTo: b.upTo * months }));
    const paye = round2(progressive(bands, taxable));
    const aidsLevy = round2(paye * AIDS_LEVY_RATE);
    const tax = round2(paye + aidsLevy);

    return {
      grossPay,
      tax,
      deductions: nssa,
      netPay: round2(grossPay - tax - nssa),
      components: {
        currency: 'USD',
        earnings,
        statutory: { paye, aidsLevy, nssa },
        employer: { employerNssa },
      },
    };
  },
};

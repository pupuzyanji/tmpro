import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';
import { asFraction, Band, earningsOf, progressive, ratesDate, round2, yearFraction } from './common';

/**
 * New Zealand — v029.A.
 *
 * PAYE (Income Tax Act 2007, rates from 31 July 2024), annual income:
 *   0 – 15,600          10.5%
 *   15,601 – 53,500     17.5%
 *   53,501 – 78,100     30%
 *   78,101 – 180,000    33%
 *   above 180,000       39%
 * Worked out on annualised period earnings (tax code M, no secondary
 * employment) and brought back to the period. Student loan repayments and
 * the independent earner tax credit are not applied.
 *
 * ACC earners' levy (incl. GST), by ACC year from 1 April:
 *   2026/27: 1.75% on earnings up to $156,641 a year
 *   2025/26: 1.67% on earnings up to $152,790 a year
 *
 * KiwiSaver: the employee's chosen rate (from the tax profile), else the
 * default — 3.5% from 1 April 2026 (3% before). The employer contributes at
 * least the same default rate; that is shown gross on the payslip (ESCT on
 * it is not worked out here) and not deducted.
 */
const NZ_PAYE_BRACKETS: Band[] = [
  { upTo: 15_600, rate: 0.105 },
  { upTo: 53_500, rate: 0.175 },
  { upTo: 78_100, rate: 0.3 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const ACC_YEARS = [
  { from: '2026-04-01', rate: 0.0175, maxEarnings: 156_641 },
  { from: '2025-04-01', rate: 0.0167, maxEarnings: 152_790 },
];

function kiwiSaverDefault(date: string): number {
  return date >= '2026-04-01' ? 0.035 : 0.03;
}

export const nzPayrollRuleset: PayrollRuleset = {
  countryCode: 'NZ',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const { earnings, grossPay } = earningsOf(input);
    const date = ratesDate(input);
    const fraction = yearFraction(input);

    const paye = round2(progressive(NZ_PAYE_BRACKETS, grossPay / fraction) * fraction);

    const acc = ACC_YEARS.find((y) => date >= y.from) ?? ACC_YEARS[ACC_YEARS.length - 1];
    const accLevy = round2(Math.min(grossPay, acc.maxEarnings * fraction) * acc.rate);

    const minimum = kiwiSaverDefault(date);
    const kiwiSaver = round2(grossPay * asFraction(input.kiwiSaverRate, minimum));
    const employerKiwiSaver = round2(grossPay * minimum);

    const deductions = round2(accLevy + kiwiSaver);
    return {
      grossPay,
      tax: paye,
      deductions,
      netPay: round2(grossPay - paye - deductions),
      components: {
        currency: 'NZD',
        earnings,
        statutory: { paye, accLevy, kiwiSaver },
        employer: { employerKiwiSaver },
      },
    };
  },
};

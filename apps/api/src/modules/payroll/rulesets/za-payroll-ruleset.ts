import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';
import { Band, earningsOf, periodMonths, progressive, ratesDate, round2, yearFraction } from './common';

/**
 * South Africa — v029.A. SARS rates of tax for individuals by tax year
 * (1 March – end of February), picked by the pay period's end date.
 *
 * 2027 tax year (1 March 2026 – 28 February 2027), annual taxable income:
 *   0 – 245,100            18%
 *   245,101 – 383,100      44,118 + 26% above 245,100
 *   383,101 – 530,200      79,998 + 31% above 383,100
 *   530,201 – 695,800      125,599 + 36% above 530,200
 *   695,801 – 887,000      185,215 + 39% above 695,800
 *   887,001 – 1,878,600    259,783 + 41% above 887,000
 *   above 1,878,600        666,339 + 45% above 1,878,600
 *   primary rebate R17,820 (threshold R99,000 under 65)
 * 2026 tax year: brackets 237,100 / 370,500 / 512,800 / 673,000 / 857,900 /
 *   1,817,000; primary rebate R17,235.
 *
 * PAYE is worked out on annualised period earnings, less the primary
 * rebate, then brought back to the period. Age rebates (65+, 75+), medical
 * tax credits and retirement-fund deductions are not applied.
 *
 * UIF: 1% employee + 1% employer on earnings up to R17,712 a month.
 * SDL: 1% of pay, employer only (employers with an annual payroll above
 * R500,000) — shown, not deducted.
 */
interface ZaYear {
  from: string;
  bands: Band[];
  primaryRebate: number;
}

const ZA_TAX_YEARS: ZaYear[] = [
  {
    from: '2026-03-01',
    bands: [
      { upTo: 245_100, rate: 0.18 },
      { upTo: 383_100, rate: 0.26 },
      { upTo: 530_200, rate: 0.31 },
      { upTo: 695_800, rate: 0.36 },
      { upTo: 887_000, rate: 0.39 },
      { upTo: 1_878_600, rate: 0.41 },
      { upTo: Infinity, rate: 0.45 },
    ],
    primaryRebate: 17_820,
  },
  {
    from: '2024-03-01',
    bands: [
      { upTo: 237_100, rate: 0.18 },
      { upTo: 370_500, rate: 0.26 },
      { upTo: 512_800, rate: 0.31 },
      { upTo: 673_000, rate: 0.36 },
      { upTo: 857_900, rate: 0.39 },
      { upTo: 1_817_000, rate: 0.41 },
      { upTo: Infinity, rate: 0.45 },
    ],
    primaryRebate: 17_235,
  },
];

const UIF_RATE = 0.01;
const UIF_MONTHLY_CEILING = 17_712;
const SDL_RATE = 0.01;

export function zaTaxYear(date: string): ZaYear {
  return ZA_TAX_YEARS.find((y) => date >= y.from) ?? ZA_TAX_YEARS[ZA_TAX_YEARS.length - 1];
}

export const zaPayrollRuleset: PayrollRuleset = {
  countryCode: 'ZA',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const { earnings, grossPay } = earningsOf(input);
    const year = zaTaxYear(ratesDate(input));
    const fraction = yearFraction(input);
    const months = periodMonths(input);

    const annual = grossPay / fraction;
    const annualTax = Math.max(0, progressive(year.bands, annual) - year.primaryRebate);
    const paye = round2(annualTax * fraction);

    const uif = round2(Math.min(grossPay, UIF_MONTHLY_CEILING * months) * UIF_RATE);
    const employerUif = uif;
    const sdl = round2(grossPay * SDL_RATE);

    return {
      grossPay,
      tax: paye,
      deductions: uif,
      netPay: round2(grossPay - paye - uif),
      components: {
        currency: 'ZAR',
        earnings,
        statutory: { paye, uif },
        employer: { employerUif, sdl },
      },
    };
  },
};

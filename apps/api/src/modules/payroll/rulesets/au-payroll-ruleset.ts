import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';
import { Band, earningsOf, progressive, ratesDate, round2, yearFraction } from './common';

/**
 * Australia — v029.A. Resident rates by income year (1 July – 30 June),
 * picked by the pay period's end date.
 *
 * 2026–27:  0 – 18,200 nil; 18,201 – 45,000 15%; 45,001 – 135,000 30%;
 *           135,001 – 190,000 37%; above 190,000 45%
 * 2025–26:  as above with 16% on 18,201 – 45,000
 *
 * Low income tax offset: $700, less 5c per $1 over $37,500, then 1.5c per
 * $1 over $45,000 (nil from $66,667).
 * Medicare levy: 2%, phased in at 10c per $1 above the low-income
 * threshold ($27,222 for a single person in 2025–26; the 2026–27 figure is
 * used as soon as it is set below).
 *
 * PAYG withholding here is the annual tax (after LITO) plus Medicare on
 * annualised period earnings, brought back to the period, for a resident
 * who claims the tax-free threshold. It is close to, but not the same as,
 * the ATO's Schedule 1 withholding formulas; HELP/STSL debts, the Medicare
 * levy surcharge and non-residents are not handled.
 *
 * Superannuation guarantee: 12% of ordinary time earnings (basic and
 * allowances, not one-off additions), paid by the employer on top of pay —
 * shown, not deducted. The maximum super contribution base is not applied.
 */
interface AuYear {
  from: string;
  bands: Band[];
  medicareLowIncome: number;
}

const AU_YEARS: AuYear[] = [
  {
    from: '2026-07-01',
    bands: [
      { upTo: 18_200, rate: 0 },
      { upTo: 45_000, rate: 0.15 },
      { upTo: 135_000, rate: 0.3 },
      { upTo: 190_000, rate: 0.37 },
      { upTo: Infinity, rate: 0.45 },
    ],
    medicareLowIncome: 27_222,
  },
  {
    from: '2024-07-01',
    bands: [
      { upTo: 18_200, rate: 0 },
      { upTo: 45_000, rate: 0.16 },
      { upTo: 135_000, rate: 0.3 },
      { upTo: 190_000, rate: 0.37 },
      { upTo: Infinity, rate: 0.45 },
    ],
    medicareLowIncome: 27_222,
  },
];

const MEDICARE_RATE = 0.02;
const MEDICARE_PHASE_IN = 0.1;
const SUPER_GUARANTEE = 0.12;

export function lito(income: number): number {
  if (income <= 37_500) return 700;
  if (income <= 45_000) return 700 - 0.05 * (income - 37_500);
  return Math.max(0, 325 - 0.015 * (income - 45_000));
}

export function medicareLevy(income: number, lowIncome: number): number {
  if (income <= lowIncome) return 0;
  return Math.min(income * MEDICARE_RATE, (income - lowIncome) * MEDICARE_PHASE_IN);
}

export const auPayrollRuleset: PayrollRuleset = {
  countryCode: 'AU',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const { earnings, regular, grossPay } = earningsOf(input);
    const date = ratesDate(input);
    const year = AU_YEARS.find((y) => date >= y.from) ?? AU_YEARS[AU_YEARS.length - 1];
    const fraction = yearFraction(input);

    const annual = grossPay / fraction;
    const incomeTax = Math.max(0, progressive(year.bands, annual) - lito(annual));
    const payg = round2(incomeTax * fraction);
    const medicare = round2(medicareLevy(annual, year.medicareLowIncome) * fraction);
    const tax = round2(payg + medicare);
    const superGuarantee = round2(regular * SUPER_GUARANTEE);

    return {
      grossPay,
      tax,
      deductions: 0,
      netPay: round2(grossPay - tax),
      components: {
        currency: 'AUD',
        earnings,
        statutory: { payg, medicareLevy: medicare },
        employer: { superGuarantee },
      },
    };
  },
};

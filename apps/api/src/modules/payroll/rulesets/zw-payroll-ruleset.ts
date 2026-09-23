import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * Zimbabwe "Native" ruleset — illustrative USD-denominated monthly PAYE
 * bands (formal-sector Zimbabwe payroll is commonly run in USD), plus NSSA
 * (Pension and Other Benefits Scheme) and the AIDS Levy. NOT verified
 * current ZIMRA/NSSA rates — confirm against zimra.co.zw / nssa.org.zw
 * before any real payroll run; bands, the NSSA ceiling and the levy rate
 * change from time to time.
 *
 * Same shape as every other native ruleset: gross pay is the sum of Basic
 * Salary, Housing/Transport/Meal/Other allowance, normalized to this run's
 * pay period by PayrollService before reaching here (`components`).
 */

// Illustrative monthly PAYE bands (USD).
const ZW_PAYE_BANDS: Array<{ upTo: number; rate: number }> = [
  { upTo: 100, rate: 0 },
  { upTo: 300, rate: 0.2 },
  { upTo: 1_000, rate: 0.25 },
  { upTo: 2_000, rate: 0.3 },
  { upTo: 3_000, rate: 0.35 },
  { upTo: Infinity, rate: 0.4 },
];

const NSSA_RATE = 0.045; // employee share, illustrative
const NSSA_CEILING = 700; // illustrative insurable-earnings ceiling (USD)
const AIDS_LEVY_RATE = 0.03; // 3% of the PAYE amount itself

function monthlyPaye(grossPay: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of ZW_PAYE_BANDS) {
    if (grossPay <= lower) break;
    const taxableInBand = Math.min(grossPay, band.upTo) - lower;
    tax += taxableInBand * band.rate;
    lower = band.upTo;
  }
  return tax;
}

export const zwPayrollRuleset: PayrollRuleset = {
  countryCode: 'ZW',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const basePaye = monthlyPaye(grossPay);
    const aidsLevy = round2(basePaye * AIDS_LEVY_RATE);
    const paye = round2(basePaye + aidsLevy);
    const nssa = round2(Math.min(grossPay, NSSA_CEILING) * NSSA_RATE);
    const deductions = round2(nssa);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye: round2(basePaye), aidsLevy, nssa },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

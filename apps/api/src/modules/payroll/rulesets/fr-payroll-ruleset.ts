import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * France "Native" ruleset — illustrative EUR monthly bands standing in for
 * "prélèvement à la source" (income tax withheld at source) plus a flat
 * employee "cotisations salariales" (social security/pension/unemployment
 * contributions) rate. Real French withholding uses a personalised rate
 * issued by the tax administration per employee (or, absent one, an
 * official non-personalised "grille de taux neutre" scale); this ruleset
 * is a simplified monthly-band approximation, NOT that official scale and
 * NOT verified current rates — confirm against impots.gouv.fr and URSSAF
 * before any real payroll run.
 *
 * Same shape as every other native ruleset: gross pay is the sum of Basic
 * Salary, Housing/Transport/Meal/Other allowance, normalized to this run's
 * pay period by PayrollService before reaching here (`components`).
 */

// Illustrative monthly income-tax-at-source bands (EUR).
const FR_PAYE_BANDS: Array<{ upTo: number; rate: number }> = [
  { upTo: 1_500, rate: 0 },
  { upTo: 2_500, rate: 0.05 },
  { upTo: 4_000, rate: 0.15 },
  { upTo: 7_500, rate: 0.28 },
  { upTo: Infinity, rate: 0.41 },
];

const SOCIAL_CONTRIBUTIONS_RATE = 0.22; // illustrative blended employee "cotisations salariales"

function monthlyPayeAtSource(grossPay: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of FR_PAYE_BANDS) {
    if (grossPay <= lower) break;
    const taxableInBand = Math.min(grossPay, band.upTo) - lower;
    tax += taxableInBand * band.rate;
    lower = band.upTo;
  }
  return tax;
}

export const frPayrollRuleset: PayrollRuleset = {
  countryCode: 'FR',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const paye = round2(monthlyPayeAtSource(grossPay));
    const socialContributions = round2(grossPay * SOCIAL_CONTRIBUTIONS_RATE);
    const deductions = round2(socialContributions);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, socialContributions },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

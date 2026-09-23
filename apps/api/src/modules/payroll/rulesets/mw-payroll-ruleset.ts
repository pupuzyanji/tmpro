import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * Malawi "Native" ruleset — illustrative MWK-denominated monthly PAYE bands
 * plus the employee's minimum Pension Act contribution. NOT verified
 * current Malawi Revenue Authority / Pension Act rates — confirm against
 * mra.mw and current Pension Act minimums before any real payroll run;
 * bands and the contribution rate change from time to time.
 *
 * Same shape as every other native ruleset: gross pay is the sum of Basic
 * Salary, Housing/Transport/Meal/Other allowance, normalized to this run's
 * pay period by PayrollService before reaching here (`components`).
 */

// Illustrative monthly PAYE bands (MWK).
const MW_PAYE_BANDS: Array<{ upTo: number; rate: number }> = [
  { upTo: 100_000, rate: 0 },
  { upTo: 330_000, rate: 0.25 },
  { upTo: 3_000_000, rate: 0.3 },
  { upTo: Infinity, rate: 0.35 },
];

const PENSION_RATE = 0.05; // employee's minimum contribution under the Pension Act, illustrative

function monthlyPaye(grossPay: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of MW_PAYE_BANDS) {
    if (grossPay <= lower) break;
    const taxableInBand = Math.min(grossPay, band.upTo) - lower;
    tax += taxableInBand * band.rate;
    lower = band.upTo;
  }
  return tax;
}

export const mwPayrollRuleset: PayrollRuleset = {
  countryCode: 'MW',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const paye = round2(monthlyPaye(grossPay));
    const pension = round2(grossPay * PENSION_RATE);
    const deductions = round2(pension);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, pension },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

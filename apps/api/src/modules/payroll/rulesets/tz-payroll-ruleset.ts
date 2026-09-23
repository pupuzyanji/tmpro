import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * Tanzania "Native" ruleset — illustrative TZS-denominated monthly PAYE
 * bands plus the employee's NSSF contribution. NOT verified current TRA/
 * NSSF rates — confirm against tra.go.tz and nssf.or.tz before any real
 * payroll run; bands and the contribution rate change from time to time.
 *
 * Same shape as every other native ruleset: gross pay is the sum of Basic
 * Salary, Housing/Transport/Meal/Other allowance, normalized to this run's
 * pay period by PayrollService before reaching here (`components`).
 */

// Illustrative monthly PAYE bands (TZS).
const TZ_PAYE_BANDS: Array<{ upTo: number; rate: number }> = [
  { upTo: 270_000, rate: 0 },
  { upTo: 520_000, rate: 0.08 },
  { upTo: 760_000, rate: 0.2 },
  { upTo: 1_000_000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
];

const NSSF_RATE = 0.1; // employee share (typically matched 10% by the employer)

function monthlyPaye(grossPay: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of TZ_PAYE_BANDS) {
    if (grossPay <= lower) break;
    const taxableInBand = Math.min(grossPay, band.upTo) - lower;
    tax += taxableInBand * band.rate;
    lower = band.upTo;
  }
  return tax;
}

export const tzPayrollRuleset: PayrollRuleset = {
  countryCode: 'TZ',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const paye = round2(monthlyPaye(grossPay));
    const nssf = round2(grossPay * NSSF_RATE);
    const deductions = round2(nssf);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, nssf },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * Zambia "Native" ruleset — monthly PAYE bands, NAPSA and National Health
 * Insurance (NHI), reverse-engineered from the employer's reference PAYE
 * calculator and pay-advice template (2026 rates). Confirm against ZRA/NAPSA
 * guidance before any real payroll run; bands, the NAPSA ceiling and the NHI
 * rate change from time to time.
 *
 * Gross/Taxable Pay is the sum of the employee's Basic Salary, Housing
 * Allowance, Transport Allowance, Meal/Lunch Allowance and any Other
 * allowance — the Compensation section's Basic Pay Rate + typed Allowances,
 * normalized to this run's pay period by PayrollService before reaching
 * here (`components`). This is a monthly calculation applied directly to
 * the pay period; a MONTHLY-paid employee's Basic Salary comes through
 * unscaled (it's already quoted per period), so it always matches the
 * Compensation record's Basic Pay Rate on a full month's run.
 */

// Monthly PAYE tax bands (Zambia, 2026).
const ZM_PAYE_BANDS: Array<{ upTo: number; rate: number }> = [
  { upTo: 5_100, rate: 0 },
  { upTo: 7_100, rate: 0.2 },
  { upTo: 9_200, rate: 0.3 },
  { upTo: Infinity, rate: 0.37 },
];

const NAPSA_RATE = 0.05;
// Monthly pensionable-earnings ceiling implied by the reference calculator
// (contribution of K1,342.00 on gross earnings that exceeded the ceiling).
const NAPSA_CEILING = 26_840;
const NHI_RATE = 0.01; // National Health Insurance — 1% of Basic Pay only

function monthlyPaye(grossPay: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of ZM_PAYE_BANDS) {
    if (grossPay <= lower) break;
    const taxableInBand = Math.min(grossPay, band.upTo) - lower;
    tax += taxableInBand * band.rate;
    lower = band.upTo;
  }
  return tax;
}

export const zmPayrollRuleset: PayrollRuleset = {
  countryCode: 'ZM',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const paye = round2(monthlyPaye(grossPay));
    const napsa = round2(Math.min(grossPay, NAPSA_CEILING) * NAPSA_RATE);
    const nhi = round2(basicSalary * NHI_RATE);
    const deductions = round2(napsa + nhi);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, napsa, nhi },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

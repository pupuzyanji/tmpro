import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * Illustrative NZ PAYE annual brackets — a working example of the ruleset
 * shape, NOT verified current IRD rates. Confirm against ird.govt.nz before
 * any real payroll run; rates and thresholds change most tax years.
 *
 * Like every native ruleset, gross pay for the period is the sum of the
 * employee's Basic Salary plus any Housing/Transport/Meal/Other allowance —
 * the Compensation section's Basic Pay Rate + typed Allowances, normalized
 * to this run's pay period by PayrollService before reaching here
 * (`components`). NZ's PAYE bands are annual, so that period gross is
 * annualised for the bracket lookup and the resulting tax pro-rated back
 * down to the period — this ruleset no longer reads a standalone
 * `annualSalary` field.
 */
const NZ_PAYE_BRACKETS: Array<{ upTo: number; rate: number }> = [
  { upTo: 15_600, rate: 0.105 },
  { upTo: 53_500, rate: 0.175 },
  { upTo: 78_100, rate: 0.3 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

const ACC_EARNER_LEVY_RATE = 0.016; // illustrative flat rate; real calc has an annual liable-income cap
const DEFAULT_KIWISAVER_RATE = 0.03;
const DAYS_PER_YEAR = 365;

function annualPaye(annualSalary: number): number {
  let tax = 0;
  let lower = 0;
  for (const bracket of NZ_PAYE_BRACKETS) {
    if (annualSalary <= lower) break;
    const taxableInBracket = Math.min(annualSalary, bracket.upTo) - lower;
    tax += taxableInBracket * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

export const nzPayrollRuleset: PayrollRuleset = {
  countryCode: 'NZ',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const periodFraction = input.periodDays / DAYS_PER_YEAR;
    // Annualise this period's actual gross (rather than reading a
    // standalone annualSalary field) so the progressive brackets apply
    // correctly, then pro-rate the resulting tax back down to the period.
    const annualisedGross = periodFraction > 0 ? grossPay / periodFraction : grossPay;
    const paye = round2(annualPaye(annualisedGross) * periodFraction);
    const accLevy = round2(grossPay * ACC_EARNER_LEVY_RATE);
    const kiwiSaver = round2(grossPay * (input.kiwiSaverRate ?? DEFAULT_KIWISAVER_RATE));
    const deductions = round2(accLevy + kiwiSaver);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, accLevy, kiwiSaver },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

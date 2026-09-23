import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * South Africa "Native" ruleset — illustrative ZAR annual PAYE brackets
 * (SARS applies PAYE on an annualised basis, same shape as the NZ ruleset)
 * plus UIF (Unemployment Insurance Fund, capped). NOT verified current SARS
 * rates — confirm against sars.gov.za before any real payroll run; brackets
 * and the UIF ceiling change most tax years.
 *
 * Gross pay for the period is the sum of Basic Salary plus any Housing/
 * Transport/Meal/Other allowance, normalized to this run's pay period by
 * PayrollService before reaching here (`components`). PAYE bands are
 * annual, so period gross is annualised for the bracket lookup and the
 * resulting tax pro-rated back down to the period.
 */
const ZA_PAYE_BRACKETS: Array<{ upTo: number; rate: number }> = [
  { upTo: 237_100, rate: 0.18 },
  { upTo: 370_500, rate: 0.26 },
  { upTo: 512_800, rate: 0.31 },
  { upTo: 673_000, rate: 0.36 },
  { upTo: 857_900, rate: 0.39 },
  { upTo: 1_817_000, rate: 0.41 },
  { upTo: Infinity, rate: 0.45 },
];

const UIF_RATE = 0.01; // employee share
const UIF_MONTHLY_CEILING = 17_712; // illustrative monthly earnings ceiling for UIF contribution
const DAYS_PER_YEAR = 365;

function annualPaye(annualSalary: number): number {
  let tax = 0;
  let lower = 0;
  for (const bracket of ZA_PAYE_BRACKETS) {
    if (annualSalary <= lower) break;
    const taxableInBracket = Math.min(annualSalary, bracket.upTo) - lower;
    tax += taxableInBracket * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

export const zaPayrollRuleset: PayrollRuleset = {
  countryCode: 'ZA',
  calculatePayPeriod(input: PayrollCalculationInput): PayrollCalculationResult {
    const c = input.components;
    const basicSalary = round2(c.basicSalary ?? 0);
    const housingAllowance = round2(c.housingAllowance ?? 0);
    const transportAllowance = round2(c.transportAllowance ?? 0);
    const lunchAllowance = round2(c.lunchAllowance ?? 0);
    const otherAllowance = round2(c.otherAllowance ?? 0);
    const grossPay = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);

    const periodFraction = input.periodDays / DAYS_PER_YEAR;
    const annualisedGross = periodFraction > 0 ? grossPay / periodFraction : grossPay;
    const paye = round2(annualPaye(annualisedGross) * periodFraction);
    const uifBase = Math.min(grossPay, UIF_MONTHLY_CEILING * (periodFraction * 12));
    const uif = round2(uifBase * UIF_RATE);
    const deductions = round2(uif);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, uif },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

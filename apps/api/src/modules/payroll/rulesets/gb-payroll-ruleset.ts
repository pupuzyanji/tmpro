import type { PayrollCalculationInput, PayrollCalculationResult, PayrollRuleset } from './payroll-ruleset.interface';

/**
 * United Kingdom "Native" ruleset — illustrative GBP annual Income Tax
 * bands (personal allowance, basic/higher/additional rate — annualised
 * like the NZ/ZA rulesets) plus Class 1 employee National Insurance, which
 * (unlike Income Tax) HMRC calculates per pay period rather than on a
 * cumulative annual basis, so it's applied directly to this period's gross
 * against monthly-equivalent thresholds. NOT verified current HMRC rates —
 * confirm against gov.uk before any real payroll run; thresholds and rates
 * change most tax years.
 *
 * Gross pay for the period is the sum of Basic Salary plus any Housing/
 * Transport/Meal/Other allowance, normalized to this run's pay period by
 * PayrollService before reaching here (`components`).
 */
const GB_INCOME_TAX_BANDS: Array<{ upTo: number; rate: number }> = [
  { upTo: 12_570, rate: 0 }, // personal allowance
  { upTo: 50_270, rate: 0.2 }, // basic rate
  { upTo: 125_140, rate: 0.4 }, // higher rate
  { upTo: Infinity, rate: 0.45 }, // additional rate
];

// Illustrative monthly-equivalent NI thresholds (annual / 12).
const NI_PRIMARY_THRESHOLD_MONTHLY = 12_570 / 12;
const NI_UPPER_EARNINGS_LIMIT_MONTHLY = 50_270 / 12;
const NI_MAIN_RATE = 0.08;
const NI_UPPER_RATE = 0.02;
const DAYS_PER_YEAR = 365;

function annualIncomeTax(annualSalary: number): number {
  let tax = 0;
  let lower = 0;
  for (const band of GB_INCOME_TAX_BANDS) {
    if (annualSalary <= lower) break;
    const taxableInBand = Math.min(annualSalary, band.upTo) - lower;
    tax += taxableInBand * band.rate;
    lower = band.upTo;
  }
  return tax;
}

/** NI is worked out per pay period directly against monthly-equivalent
 *  thresholds, scaled to this period's actual length (periodDays/30 as a
 *  simple "how many months is this period" proxy) rather than annualised
 *  the way Income Tax is. */
function periodNationalInsurance(periodGross: number, periodDays: number): number {
  const periodsPerRun = periodDays / (DAYS_PER_YEAR / 12);
  const primary = NI_PRIMARY_THRESHOLD_MONTHLY * periodsPerRun;
  const upper = NI_UPPER_EARNINGS_LIMIT_MONTHLY * periodsPerRun;
  const mainBand = Math.max(0, Math.min(periodGross, upper) - primary);
  const upperBand = Math.max(0, periodGross - upper);
  return mainBand * NI_MAIN_RATE + upperBand * NI_UPPER_RATE;
}

export const gbPayrollRuleset: PayrollRuleset = {
  countryCode: 'GB',
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
    const paye = round2(annualIncomeTax(annualisedGross) * periodFraction);
    const nationalInsurance = round2(periodNationalInsurance(grossPay, input.periodDays));
    const deductions = round2(nationalInsurance);
    const netPay = round2(grossPay - paye - deductions);

    return {
      grossPay,
      tax: paye,
      deductions,
      netPay,
      components: {
        earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance },
        statutory: { paye, nationalInsurance },
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

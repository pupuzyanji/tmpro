// v029.A — helpers shared by the native payroll rulesets.

import type { PayrollCalculationInput } from './payroll-ruleset.interface';

export type Band = { upTo: number; rate: number };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tax on `amount` over progressive bands (each band's `upTo` is the top of
 *  that band; the last is Infinity). */
export function progressive(bands: Band[], amount: number): number {
  let tax = 0;
  let lower = 0;
  for (const b of bands) {
    if (amount <= lower) break;
    tax += (Math.min(amount, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

/** The earnings lines every native ruleset reads, rounded, plus gross pay. */
export function earningsOf(input: PayrollCalculationInput) {
  const c = input.components;
  const basicSalary = round2(c.basicSalary ?? 0);
  const housingAllowance = round2(c.housingAllowance ?? 0);
  const transportAllowance = round2(c.transportAllowance ?? 0);
  const lunchAllowance = round2(c.lunchAllowance ?? 0);
  const otherAllowance = round2(c.otherAllowance ?? 0);
  // Taxable payroll additions (bonus, leave pay, taxable gratuity) — v028.F.
  const taxableAdditions = round2(c.taxableAdditions ?? 0);
  const regular = round2(basicSalary + housingAllowance + transportAllowance + lunchAllowance + otherAllowance);
  const grossPay = round2(regular + taxableAdditions);
  return {
    earnings: { basicSalary, housingAllowance, transportAllowance, lunchAllowance, otherAllowance, taxableAdditions },
    /** Gross without one-off taxable additions (for "ordinary time earnings"). */
    regular,
    grossPay,
  };
}

const DAYS_PER_YEAR = 365;

/** The share of a year this pay period covers — exactly 1/12 for a monthly
 *  run (28–31 days), so annual tables give the same monthly figure every
 *  month; days / 365 otherwise. */
export function yearFraction(input: PayrollCalculationInput): number {
  const d = input.periodDays;
  if (d >= 28 && d <= 31) return 1 / 12;
  return d > 0 ? d / DAYS_PER_YEAR : 1 / 12;
}

/** The pay period in months, treating any period of 28 days or more up to a
 *  calendar month as exactly one month (monthly tax tables and monthly
 *  ceilings apply as published on an ordinary monthly run). */
export function periodMonths(input: PayrollCalculationInput): number {
  const d = input.periodDays;
  if (d >= 28 && d <= 31) return 1;
  return d > 0 ? (d * 12) / DAYS_PER_YEAR : 1;
}

/** The date the rates are taken from — the period end, else today. */
export function ratesDate(input: PayrollCalculationInput): string {
  return (input.periodEnd ?? new Date().toISOString()).slice(0, 10);
}

/** A percentage given either as a fraction (0.035) or as a percent (3.5). */
export function asFraction(rate: number | null | undefined, fallback: number): number {
  if (rate == null || !Number.isFinite(Number(rate)) || Number(rate) <= 0) return fallback;
  const r = Number(rate);
  return r > 1 ? r / 100 : r;
}

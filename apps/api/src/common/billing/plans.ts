// v025.A — tmPro's subscription catalogue: three plans x four company-size
// bands, flat monthly prices in USD. 200+ employees is "Contact us" (a
// MANUAL tenant the platform owner provisions by hand), not a Stripe price.
//
// Mirrored on the frontend at apps/web/src/lib/billing-plans.ts — keep both
// in sync by hand (same arrangement as module-catalog.ts / lib/modules.ts).
//
// Each (plan, band) pair maps to one Stripe Price, found by its lookup key
// (`tmpro_<plan>_<band>`, e.g. `tmpro_growth_b50`). `npm run billing:setup`
// creates those Products/Prices in whichever Stripe account
// STRIPE_SECRET_KEY points at, so the numbers below are the single source of
// truth — change a price here, re-run the setup script, done.
import type { ModuleKey } from '../modules/module-catalog';

export const PLAN_KEYS = ['CORE', 'GROWTH', 'PRO'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const BAND_KEYS = ['B20', 'B50', 'B100', 'B200'] as const;
export type BandKey = (typeof BAND_KEYS)[number];

export const BILLING_CURRENCY = 'usd';

export const BANDS: Record<BandKey, { label: string; min: number; max: number }> = {
  B20: { label: '0–20 employees', min: 0, max: 20 },
  B50: { label: '21–50 employees', min: 21, max: 50 },
  B100: { label: '51–100 employees', min: 51, max: 100 },
  B200: { label: '101–200 employees', min: 101, max: 200 },
};

const CORE_MODULES: ModuleKey[] = ['Employee Records', 'Leave & Attendance', 'Policies & Documents'];
const GROWTH_MODULES: ModuleKey[] = [...CORE_MODULES, 'Timesheets', 'Payroll', 'Reports & Analytics'];
const PRO_MODULES: ModuleKey[] = [...GROWTH_MODULES, 'Recruitment', 'Performance Management', 'Training & LMS'];

export const PLANS: Record<PlanKey, { name: string; tagline: string; modules: ModuleKey[] }> = {
  CORE: { name: 'Core', tagline: 'Your HR system of record', modules: CORE_MODULES },
  GROWTH: { name: 'Growth', tagline: 'Add payroll, timesheets and reporting', modules: GROWTH_MODULES },
  PRO: { name: 'Pro', tagline: 'The complete talent platform', modules: PRO_MODULES },
};

/** Whole US dollars per month. */
export const PRICES_USD: Record<PlanKey, Record<BandKey, number>> = {
  CORE: { B20: 35, B50: 85, B100: 140, B200: 240 },
  GROWTH: { B20: 60, B50: 125, B100: 200, B200: 300 },
  PRO: { B20: 85, B50: 175, B100: 280, B200: 420 },
};

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === 'string' && (PLAN_KEYS as readonly string[]).includes(v);
}

export function isBandKey(v: unknown): v is BandKey {
  return typeof v === 'string' && (BAND_KEYS as readonly string[]).includes(v);
}

export function lookupKey(plan: PlanKey, band: BandKey): string {
  return `tmpro_${plan.toLowerCase()}_${band.toLowerCase()}`;
}

export function parseLookupKey(key: string | null | undefined): { plan: PlanKey; band: BandKey } | null {
  const m = /^tmpro_([a-z]+)_([a-z0-9]+)$/.exec(key ?? '');
  if (!m) return null;
  const plan = m[1].toUpperCase();
  const band = m[2].toUpperCase();
  return isPlanKey(plan) && isBandKey(band) ? { plan, band } : null;
}

/** Smallest band that holds `headcount` employees, or null once it's past
 *  200 (the "Contact us" tier). */
export function bandForHeadcount(headcount: number): BandKey | null {
  return BAND_KEYS.find((b) => headcount <= BANDS[b].max) ?? null;
}

/** The next band up, or null from B200 (only "Contact us" is above it). */
export function nextBand(band: BandKey): BandKey | null {
  const i = BAND_KEYS.indexOf(band);
  return i >= 0 && i < BAND_KEYS.length - 1 ? BAND_KEYS[i + 1] : null;
}

export function monthlyPriceUsd(plan: string | null, band: string | null): number | null {
  return isPlanKey(plan) && isBandKey(band) ? PRICES_USD[plan][band] : null;
}

export function trialDays(): number {
  const n = Number(process.env.BILLING_TRIAL_DAYS ?? 7);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 7;
}

/** Public catalogue shape for GET /billing/plans and the pricing page. */
export function publicCatalogue() {
  return {
    currency: BILLING_CURRENCY.toUpperCase(),
    trialDays: trialDays(),
    bands: BAND_KEYS.map((key) => ({ key, ...BANDS[key] })),
    plans: PLAN_KEYS.map((key) => ({
      key,
      name: PLANS[key].name,
      tagline: PLANS[key].tagline,
      modules: PLANS[key].modules,
      prices: PRICES_USD[key],
    })),
  };
}

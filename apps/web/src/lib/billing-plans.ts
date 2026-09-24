// v025.A — frontend mirror of apps/api/src/common/billing/plans.ts. Keep the
// two in sync by hand (same arrangement as lib/modules.ts). The API's
// GET /billing/plans returns the same catalogue; this copy lets the public
// pricing page render instantly without waiting on the API.

export const PLAN_KEYS = ['CORE', 'GROWTH', 'PRO'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export const BAND_KEYS = ['B20', 'B50', 'B100', 'B200'] as const;
export type BandKey = (typeof BAND_KEYS)[number];

export const BANDS: Record<BandKey, { label: string; short: string; max: number }> = {
  B20: { label: '0–20 employees', short: '0–20', max: 20 },
  B50: { label: '21–50 employees', short: '21–50', max: 50 },
  B100: { label: '51–100 employees', short: '51–100', max: 100 },
  B200: { label: '101–200 employees', short: '101–200', max: 200 },
};

const CORE = ['Employee Records', 'Leave & Attendance', 'Policies & Documents'];
const GROWTH = [...CORE, 'Timesheets', 'Payroll', 'Reports & Analytics'];
const PRO = [...GROWTH, 'Recruitment', 'Performance Management', 'Training & LMS'];

export const PLANS: Record<PlanKey, { name: string; tagline: string; modules: string[]; highlight?: boolean }> = {
  CORE: { name: 'Core', tagline: 'Your HR system of record', modules: CORE },
  GROWTH: { name: 'Growth', tagline: 'Add payroll, timesheets and reporting', modules: GROWTH, highlight: true },
  PRO: { name: 'Pro', tagline: 'The complete talent platform', modules: PRO },
};

export const PRICES_USD: Record<PlanKey, Record<BandKey, number>> = {
  CORE: { B20: 35, B50: 85, B100: 140, B200: 240 },
  GROWTH: { B20: 60, B50: 125, B100: 200, B200: 300 },
  PRO: { B20: 85, B50: 175, B100: 280, B200: 420 },
};

export const TRIAL_DAYS = 7;

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === 'string' && (PLAN_KEYS as readonly string[]).includes(v);
}
export function isBandKey(v: unknown): v is BandKey {
  return typeof v === 'string' && (BAND_KEYS as readonly string[]).includes(v);
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Visitor currency detection — for the "≈ local price" estimate only. The
// real charge currency is decided by Stripe Checkout (Adaptive Pricing).
// Uses the browser's timezone first (reflects where the device actually is,
// without any IP lookup or third-party call), then the browser language's
// region as a fallback.

const TZ_COUNTRY: Record<string, string> = {
  'Africa/Lusaka': 'ZM', 'Africa/Johannesburg': 'ZA', 'Africa/Maseru': 'LS', 'Africa/Mbabane': 'SZ',
  'Africa/Gaborone': 'BW', 'Africa/Windhoek': 'NA', 'Africa/Harare': 'ZW', 'Africa/Blantyre': 'MW',
  'Africa/Maputo': 'MZ', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG',
  'Africa/Kigali': 'RW', 'Africa/Bujumbura': 'BI', 'Africa/Lubumbashi': 'CD', 'Africa/Kinshasa': 'CD',
  'Africa/Luanda': 'AO', 'Africa/Addis_Ababa': 'ET', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
  'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN', 'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA',
  'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ', 'Africa/Douala': 'CM', 'Africa/Khartoum': 'SD',
  'Indian/Mauritius': 'MU', 'Indian/Antananarivo': 'MG',
  'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Port_Moresby': 'PG',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU', 'Australia/Darwin': 'AU',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Lisbon': 'PT', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR',
  'Europe/Istanbul': 'TR', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA',
  'America/Halifax': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN', 'Asia/Hong_Kong': 'HK', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
};

const COUNTRY_CURRENCY: Record<string, string> = {
  ZM: 'ZMW', ZA: 'ZAR', LS: 'LSL', SZ: 'SZL', BW: 'BWP', NA: 'NAD', ZW: 'USD', MW: 'MWK', MZ: 'MZN',
  TZ: 'TZS', KE: 'KES', UG: 'UGX', RW: 'RWF', BI: 'BIF', CD: 'CDF', AO: 'AOA', ET: 'ETB', NG: 'NGN',
  GH: 'GHS', CI: 'XOF', SN: 'XOF', EG: 'EGP', MA: 'MAD', TN: 'TND', DZ: 'DZD', CM: 'XAF', SD: 'SDG',
  MU: 'MUR', MG: 'MGA', NZ: 'NZD', FJ: 'FJD', PG: 'PGK', AU: 'AUD', GB: 'GBP', IE: 'EUR', FR: 'EUR',
  DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY',
  UA: 'UAH', US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  AE: 'AED', SA: 'SAR', QA: 'QAR', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', SG: 'SGD', MY: 'MYR',
  ID: 'IDR', PH: 'PHP', TH: 'THB', VN: 'VND', HK: 'HKD', CN: 'CNY', JP: 'JPY', KR: 'KRW',
};

export interface VisitorLocale {
  country: string | null;
  countryName: string | null;
  currency: string;
}

export function detectVisitorLocale(): VisitorLocale {
  let country: string | null = null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    country = TZ_COUNTRY[tz] ?? null;
  } catch {
    // ignore
  }
  if (!country && typeof navigator !== 'undefined') {
    const region = (navigator.language || '').split('-')[1];
    if (region && region.length === 2) country = region.toUpperCase();
  }
  const currency = (country && COUNTRY_CURRENCY[country]) || 'USD';
  let countryName: string | null = null;
  if (country) {
    try {
      countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country;
    } catch {
      countryName = country;
    }
  }
  return { country, countryName, currency };
}

/** Currencies offered in the pricing page's currency picker. */
export const PICKER_CURRENCIES = [
  'USD', 'ZMW', 'ZAR', 'NZD', 'AUD', 'GBP', 'EUR', 'BWP', 'MWK', 'TZS', 'KES', 'UGX', 'NGN', 'GHS', 'NAD', 'MZN', 'CAD', 'AED', 'INR',
];

// Symbols as they're written locally, where Intl's default differs
// (Intl renders the Zambian kwacha as "ZK"; Zambians write "K").
const LOCAL_SYMBOL: Record<string, string> = { ZMW: 'K', MWK: 'MK', BWP: 'P' };

export function formatMoney(amount: number, currency: string): string {
  if (LOCAL_SYMBOL[currency]) {
    const digits = amount >= 100 ? 0 : 2;
    return `${LOCAL_SYMBOL[currency]}${amount.toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: amount >= 100 || currency !== 'USD' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en')}`;
  }
}

/** A friendlier estimate: round to 2 significant-ish figures for big
 *  numbers so "≈ K 1,587.43" reads as "≈ K 1,590". */
export function roundEstimate(amount: number): number {
  if (amount >= 100_000) return Math.round(amount / 1000) * 1000;
  if (amount >= 10_000) return Math.round(amount / 100) * 100;
  if (amount >= 1_000) return Math.round(amount / 10) * 10;
  return Math.round(amount);
}

export function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

// A handful of currency codes Intl.NumberFormat renders as an odd/absent
// symbol in most locales (or that this platform's ZM ruleset predates using
// a plain "K" prefix for) — kept short and falling back to Intl otherwise,
// so any org currency the Settings page is given still renders sensibly.
const CURRENCY_SYMBOLS: Record<string, string> = {
  ZMW: 'K',
  NZD: '$',
  AUD: '$',
  USD: '$',
};

/** Formats an amount using the organization's configured currency (Settings
 *  → Organization → Currency) — the single source of truth for money display
 *  across payroll, payslips, and anywhere else financial. Falls back to a
 *  plain "<code> <amount>" if the code isn't valid for Intl formatting. */
export function formatMoney(amount: number, currencyCode: string | null | undefined): string {
  const code = (currencyCode ?? 'ZMW').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  if (symbol) {
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

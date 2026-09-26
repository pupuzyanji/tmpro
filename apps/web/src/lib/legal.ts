// v026.A — one place for the facts that appear on the public Support,
// Privacy Policy and Terms of Service pages. Change them here and every page
// picks the change up.

export const LEGAL = {
  /** The legal entity that operates tmPro and contracts with customers. */
  company: 'Riverbird Technology Partners Limited',
  /** Trading name used alongside the legal name. */
  tradingName: 'Bitware',
  /** Country whose law governs the Terms and whose privacy law we follow. */
  country: 'New Zealand',
  product: 'tmPro',
  website: 'https://tmpro.bitware.app',
  supportEmail: 'us@bitware.app',
  privacyEmail: 'us@bitware.app',
  /** Date the current versions of the Privacy Policy and Terms took effect. */
  effectiveDate: '26 September 2026',
  /** How long a cancelled organisation's data is kept before deletion. */
  retentionDaysAfterCancel: 90,
  /** Target first-response time for support emails. */
  supportResponse: 'within one business day (New Zealand time)',
} as const;

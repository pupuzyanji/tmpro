// Shared reference/lookup lists for "globally known" fields — Country,
// Nationality, Timezone, Blood Group — so these are picked from a dropdown
// instead of typed freehand. Country stores/display its ISO 3166-1 alpha-2
// short code once picked; Nationality is looked up from the same list.

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export interface CountryOption {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  nationality: string; // demonym, for the Nationality dropdown
}

export const COUNTRIES: CountryOption[] = [
  { code: 'AF', name: 'Afghanistan', nationality: 'Afghan' },
  { code: 'AL', name: 'Albania', nationality: 'Albanian' },
  { code: 'DZ', name: 'Algeria', nationality: 'Algerian' },
  { code: 'AR', name: 'Argentina', nationality: 'Argentine' },
  { code: 'AM', name: 'Armenia', nationality: 'Armenian' },
  { code: 'AU', name: 'Australia', nationality: 'Australian' },
  { code: 'AT', name: 'Austria', nationality: 'Austrian' },
  { code: 'AZ', name: 'Azerbaijan', nationality: 'Azerbaijani' },
  { code: 'BH', name: 'Bahrain', nationality: 'Bahraini' },
  { code: 'BD', name: 'Bangladesh', nationality: 'Bangladeshi' },
  { code: 'BY', name: 'Belarus', nationality: 'Belarusian' },
  { code: 'BE', name: 'Belgium', nationality: 'Belgian' },
  { code: 'BZ', name: 'Belize', nationality: 'Belizean' },
  { code: 'BJ', name: 'Benin', nationality: 'Beninese' },
  { code: 'BT', name: 'Bhutan', nationality: 'Bhutanese' },
  { code: 'BO', name: 'Bolivia', nationality: 'Bolivian' },
  { code: 'BA', name: 'Bosnia and Herzegovina', nationality: 'Bosnian' },
  { code: 'BW', name: 'Botswana', nationality: 'Motswana' },
  { code: 'BR', name: 'Brazil', nationality: 'Brazilian' },
  { code: 'BN', name: 'Brunei', nationality: 'Bruneian' },
  { code: 'BG', name: 'Bulgaria', nationality: 'Bulgarian' },
  { code: 'BF', name: 'Burkina Faso', nationality: 'Burkinabe' },
  { code: 'BI', name: 'Burundi', nationality: 'Burundian' },
  { code: 'KH', name: 'Cambodia', nationality: 'Cambodian' },
  { code: 'CM', name: 'Cameroon', nationality: 'Cameroonian' },
  { code: 'CA', name: 'Canada', nationality: 'Canadian' },
  { code: 'CV', name: 'Cabo Verde', nationality: 'Cabo Verdean' },
  { code: 'CF', name: 'Central African Republic', nationality: 'Central African' },
  { code: 'TD', name: 'Chad', nationality: 'Chadian' },
  { code: 'CL', name: 'Chile', nationality: 'Chilean' },
  { code: 'CN', name: 'China', nationality: 'Chinese' },
  { code: 'CO', name: 'Colombia', nationality: 'Colombian' },
  { code: 'KM', name: 'Comoros', nationality: 'Comoran' },
  { code: 'CG', name: 'Congo (Congo-Brazzaville)', nationality: 'Congolese' },
  { code: 'CD', name: 'Congo (DR Congo)', nationality: 'Congolese' },
  { code: 'CR', name: 'Costa Rica', nationality: 'Costa Rican' },
  { code: 'CI', name: "Cote d'Ivoire", nationality: 'Ivorian' },
  { code: 'HR', name: 'Croatia', nationality: 'Croatian' },
  { code: 'CU', name: 'Cuba', nationality: 'Cuban' },
  { code: 'CY', name: 'Cyprus', nationality: 'Cypriot' },
  { code: 'CZ', name: 'Czechia', nationality: 'Czech' },
  { code: 'DK', name: 'Denmark', nationality: 'Danish' },
  { code: 'DJ', name: 'Djibouti', nationality: 'Djiboutian' },
  { code: 'DO', name: 'Dominican Republic', nationality: 'Dominican' },
  { code: 'EC', name: 'Ecuador', nationality: 'Ecuadorian' },
  { code: 'EG', name: 'Egypt', nationality: 'Egyptian' },
  { code: 'SV', name: 'El Salvador', nationality: 'Salvadoran' },
  { code: 'GQ', name: 'Equatorial Guinea', nationality: 'Equatoguinean' },
  { code: 'ER', name: 'Eritrea', nationality: 'Eritrean' },
  { code: 'EE', name: 'Estonia', nationality: 'Estonian' },
  { code: 'SZ', name: 'Eswatini', nationality: 'Swazi' },
  { code: 'ET', name: 'Ethiopia', nationality: 'Ethiopian' },
  { code: 'FJ', name: 'Fiji', nationality: 'Fijian' },
  { code: 'FI', name: 'Finland', nationality: 'Finnish' },
  { code: 'FR', name: 'France', nationality: 'French' },
  { code: 'GA', name: 'Gabon', nationality: 'Gabonese' },
  { code: 'GM', name: 'Gambia', nationality: 'Gambian' },
  { code: 'GE', name: 'Georgia', nationality: 'Georgian' },
  { code: 'DE', name: 'Germany', nationality: 'German' },
  { code: 'GH', name: 'Ghana', nationality: 'Ghanaian' },
  { code: 'GR', name: 'Greece', nationality: 'Greek' },
  { code: 'GT', name: 'Guatemala', nationality: 'Guatemalan' },
  { code: 'GN', name: 'Guinea', nationality: 'Guinean' },
  { code: 'GW', name: 'Guinea-Bissau', nationality: 'Bissau-Guinean' },
  { code: 'GY', name: 'Guyana', nationality: 'Guyanese' },
  { code: 'HT', name: 'Haiti', nationality: 'Haitian' },
  { code: 'HN', name: 'Honduras', nationality: 'Honduran' },
  { code: 'HK', name: 'Hong Kong', nationality: 'Hong Konger' },
  { code: 'HU', name: 'Hungary', nationality: 'Hungarian' },
  { code: 'IS', name: 'Iceland', nationality: 'Icelandic' },
  { code: 'IN', name: 'India', nationality: 'Indian' },
  { code: 'ID', name: 'Indonesia', nationality: 'Indonesian' },
  { code: 'IR', name: 'Iran', nationality: 'Iranian' },
  { code: 'IQ', name: 'Iraq', nationality: 'Iraqi' },
  { code: 'IE', name: 'Ireland', nationality: 'Irish' },
  { code: 'IL', name: 'Israel', nationality: 'Israeli' },
  { code: 'IT', name: 'Italy', nationality: 'Italian' },
  { code: 'JM', name: 'Jamaica', nationality: 'Jamaican' },
  { code: 'JP', name: 'Japan', nationality: 'Japanese' },
  { code: 'JO', name: 'Jordan', nationality: 'Jordanian' },
  { code: 'KZ', name: 'Kazakhstan', nationality: 'Kazakhstani' },
  { code: 'KE', name: 'Kenya', nationality: 'Kenyan' },
  { code: 'KI', name: 'Kiribati', nationality: 'I-Kiribati' },
  { code: 'KW', name: 'Kuwait', nationality: 'Kuwaiti' },
  { code: 'KG', name: 'Kyrgyzstan', nationality: 'Kyrgyzstani' },
  { code: 'LA', name: 'Laos', nationality: 'Lao' },
  { code: 'LV', name: 'Latvia', nationality: 'Latvian' },
  { code: 'LB', name: 'Lebanon', nationality: 'Lebanese' },
  { code: 'LS', name: 'Lesotho', nationality: 'Mosotho' },
  { code: 'LR', name: 'Liberia', nationality: 'Liberian' },
  { code: 'LY', name: 'Libya', nationality: 'Libyan' },
  { code: 'LI', name: 'Liechtenstein', nationality: 'Liechtensteiner' },
  { code: 'LT', name: 'Lithuania', nationality: 'Lithuanian' },
  { code: 'LU', name: 'Luxembourg', nationality: 'Luxembourgish' },
  { code: 'MG', name: 'Madagascar', nationality: 'Malagasy' },
  { code: 'MW', name: 'Malawi', nationality: 'Malawian' },
  { code: 'MY', name: 'Malaysia', nationality: 'Malaysian' },
  { code: 'MV', name: 'Maldives', nationality: 'Maldivian' },
  { code: 'ML', name: 'Mali', nationality: 'Malian' },
  { code: 'MT', name: 'Malta', nationality: 'Maltese' },
  { code: 'MR', name: 'Mauritania', nationality: 'Mauritanian' },
  { code: 'MU', name: 'Mauritius', nationality: 'Mauritian' },
  { code: 'MX', name: 'Mexico', nationality: 'Mexican' },
  { code: 'MD', name: 'Moldova', nationality: 'Moldovan' },
  { code: 'MC', name: 'Monaco', nationality: 'Monegasque' },
  { code: 'MN', name: 'Mongolia', nationality: 'Mongolian' },
  { code: 'ME', name: 'Montenegro', nationality: 'Montenegrin' },
  { code: 'MA', name: 'Morocco', nationality: 'Moroccan' },
  { code: 'MZ', name: 'Mozambique', nationality: 'Mozambican' },
  { code: 'MM', name: 'Myanmar', nationality: 'Burmese' },
  { code: 'NA', name: 'Namibia', nationality: 'Namibian' },
  { code: 'NP', name: 'Nepal', nationality: 'Nepali' },
  { code: 'NL', name: 'Netherlands', nationality: 'Dutch' },
  { code: 'NZ', name: 'New Zealand', nationality: 'New Zealander' },
  { code: 'NI', name: 'Nicaragua', nationality: 'Nicaraguan' },
  { code: 'NE', name: 'Niger', nationality: 'Nigerien' },
  { code: 'NG', name: 'Nigeria', nationality: 'Nigerian' },
  { code: 'MK', name: 'North Macedonia', nationality: 'Macedonian' },
  { code: 'NO', name: 'Norway', nationality: 'Norwegian' },
  { code: 'OM', name: 'Oman', nationality: 'Omani' },
  { code: 'PK', name: 'Pakistan', nationality: 'Pakistani' },
  { code: 'PA', name: 'Panama', nationality: 'Panamanian' },
  { code: 'PG', name: 'Papua New Guinea', nationality: 'Papua New Guinean' },
  { code: 'PY', name: 'Paraguay', nationality: 'Paraguayan' },
  { code: 'PE', name: 'Peru', nationality: 'Peruvian' },
  { code: 'PH', name: 'Philippines', nationality: 'Filipino' },
  { code: 'PL', name: 'Poland', nationality: 'Polish' },
  { code: 'PT', name: 'Portugal', nationality: 'Portuguese' },
  { code: 'QA', name: 'Qatar', nationality: 'Qatari' },
  { code: 'RO', name: 'Romania', nationality: 'Romanian' },
  { code: 'RU', name: 'Russia', nationality: 'Russian' },
  { code: 'RW', name: 'Rwanda', nationality: 'Rwandan' },
  { code: 'WS', name: 'Samoa', nationality: 'Samoan' },
  { code: 'SA', name: 'Saudi Arabia', nationality: 'Saudi' },
  { code: 'SN', name: 'Senegal', nationality: 'Senegalese' },
  { code: 'RS', name: 'Serbia', nationality: 'Serbian' },
  { code: 'SC', name: 'Seychelles', nationality: 'Seychellois' },
  { code: 'SL', name: 'Sierra Leone', nationality: 'Sierra Leonean' },
  { code: 'SG', name: 'Singapore', nationality: 'Singaporean' },
  { code: 'SK', name: 'Slovakia', nationality: 'Slovak' },
  { code: 'SI', name: 'Slovenia', nationality: 'Slovenian' },
  { code: 'SB', name: 'Solomon Islands', nationality: 'Solomon Islander' },
  { code: 'SO', name: 'Somalia', nationality: 'Somali' },
  { code: 'ZA', name: 'South Africa', nationality: 'South African' },
  { code: 'KR', name: 'South Korea', nationality: 'South Korean' },
  { code: 'SS', name: 'South Sudan', nationality: 'South Sudanese' },
  { code: 'ES', name: 'Spain', nationality: 'Spanish' },
  { code: 'LK', name: 'Sri Lanka', nationality: 'Sri Lankan' },
  { code: 'SD', name: 'Sudan', nationality: 'Sudanese' },
  { code: 'SR', name: 'Suriname', nationality: 'Surinamese' },
  { code: 'SE', name: 'Sweden', nationality: 'Swedish' },
  { code: 'CH', name: 'Switzerland', nationality: 'Swiss' },
  { code: 'SY', name: 'Syria', nationality: 'Syrian' },
  { code: 'TW', name: 'Taiwan', nationality: 'Taiwanese' },
  { code: 'TJ', name: 'Tajikistan', nationality: 'Tajikistani' },
  { code: 'TZ', name: 'Tanzania', nationality: 'Tanzanian' },
  { code: 'TH', name: 'Thailand', nationality: 'Thai' },
  { code: 'TL', name: 'Timor-Leste', nationality: 'Timorese' },
  { code: 'TG', name: 'Togo', nationality: 'Togolese' },
  { code: 'TO', name: 'Tonga', nationality: 'Tongan' },
  { code: 'TT', name: 'Trinidad and Tobago', nationality: 'Trinidadian' },
  { code: 'TN', name: 'Tunisia', nationality: 'Tunisian' },
  { code: 'TR', name: 'Turkey', nationality: 'Turkish' },
  { code: 'TM', name: 'Turkmenistan', nationality: 'Turkmen' },
  { code: 'TV', name: 'Tuvalu', nationality: 'Tuvaluan' },
  { code: 'UG', name: 'Uganda', nationality: 'Ugandan' },
  { code: 'UA', name: 'Ukraine', nationality: 'Ukrainian' },
  { code: 'AE', name: 'United Arab Emirates', nationality: 'Emirati' },
  { code: 'GB', name: 'United Kingdom', nationality: 'British' },
  { code: 'US', name: 'United States', nationality: 'American' },
  { code: 'UY', name: 'Uruguay', nationality: 'Uruguayan' },
  { code: 'UZ', name: 'Uzbekistan', nationality: 'Uzbekistani' },
  { code: 'VU', name: 'Vanuatu', nationality: 'Ni-Vanuatu' },
  { code: 'VA', name: 'Vatican City', nationality: 'Vatican' },
  { code: 'VE', name: 'Venezuela', nationality: 'Venezuelan' },
  { code: 'VN', name: 'Vietnam', nationality: 'Vietnamese' },
  { code: 'YE', name: 'Yemen', nationality: 'Yemeni' },
  { code: 'ZM', name: 'Zambia', nationality: 'Zambian' },
  { code: 'ZW', name: 'Zimbabwe', nationality: 'Zimbabwean' },
].sort((a, b) => a.name.localeCompare(b.name));

export function countryName(code: string | null | undefined) {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// International calling codes (ITU-T E.164 country codes), keyed by the
// same ISO 3166-1 alpha-2 code as COUNTRIES above — for a phone number
// field's country-code dropdown (e.g. the "Sign-up Here" form's Phone
// number field). Several countries share the +1 North American Numbering
// Plan code (US, CA, JM, TT); each still gets its own dropdown row since
// the country, not just the code, is what the picker shows.
const DIAL_CODES: Record<string, string> = {
  AF: '+93', AL: '+355', DZ: '+213', AR: '+54', AM: '+374', AU: '+61', AT: '+43', AZ: '+994',
  BH: '+973', BD: '+880', BY: '+375', BE: '+32', BZ: '+501', BJ: '+229', BT: '+975', BO: '+591',
  BA: '+387', BW: '+267', BR: '+55', BN: '+673', BG: '+359', BF: '+226', BI: '+257', KH: '+855',
  CM: '+237', CA: '+1', CV: '+238', CF: '+236', TD: '+235', CL: '+56', CN: '+86', CO: '+57',
  KM: '+269', CG: '+242', CD: '+243', CR: '+506', CI: '+225', HR: '+385', CU: '+53', CY: '+357',
  CZ: '+420', DK: '+45', DJ: '+253', DO: '+1', EC: '+593', EG: '+20', SV: '+503', GQ: '+240',
  ER: '+291', EE: '+372', SZ: '+268', ET: '+251', FJ: '+679', FI: '+358', FR: '+33', GA: '+241',
  GM: '+220', GE: '+995', DE: '+49', GH: '+233', GR: '+30', GT: '+502', GN: '+224', GW: '+245',
  GY: '+592', HT: '+509', HN: '+504', HK: '+852', HU: '+36', IS: '+354', IN: '+91', ID: '+62',
  IR: '+98', IQ: '+964', IE: '+353', IL: '+972', IT: '+39', JM: '+1', JP: '+81', JO: '+962',
  KZ: '+7', KE: '+254', KI: '+686', KW: '+965', KG: '+996', LA: '+856', LV: '+371', LB: '+961',
  LS: '+266', LR: '+231', LY: '+218', LI: '+423', LT: '+370', LU: '+352', MG: '+261', MW: '+265',
  MY: '+60', MV: '+960', ML: '+223', MT: '+356', MR: '+222', MU: '+230', MX: '+52', MD: '+373',
  MC: '+377', MN: '+976', ME: '+382', MA: '+212', MZ: '+258', MM: '+95', NA: '+264', NP: '+977',
  NL: '+31', NZ: '+64', NI: '+505', NE: '+227', NG: '+234', MK: '+389', NO: '+47', OM: '+968',
  PK: '+92', PA: '+507', PG: '+675', PY: '+595', PE: '+51', PH: '+63', PL: '+48', PT: '+351',
  QA: '+974', RO: '+40', RU: '+7', RW: '+250', WS: '+685', SA: '+966', SN: '+221', RS: '+381',
  SC: '+248', SL: '+232', SG: '+65', SK: '+421', SI: '+386', SB: '+677', SO: '+252', ZA: '+27',
  KR: '+82', SS: '+211', ES: '+34', LK: '+94', SD: '+249', SR: '+597', SE: '+46', CH: '+41',
  SY: '+963', TW: '+886', TJ: '+992', TZ: '+255', TH: '+66', TL: '+670', TG: '+228', TO: '+676',
  TT: '+1', TN: '+216', TR: '+90', TM: '+993', TV: '+688', UG: '+256', UA: '+380', AE: '+971',
  GB: '+44', US: '+1', UY: '+598', UZ: '+998', VU: '+678', VA: '+379', VE: '+58', VN: '+84',
  YE: '+967', ZM: '+260', ZW: '+263',
};

export interface DialCodeOption {
  code: string; // ISO 3166-1 alpha-2, matches CountryOption.code
  name: string;
  dialCode: string; // e.g. "+260"
}

/** COUNTRIES joined with DIAL_CODES, for a phone number field's
 *  country-code dropdown — sorted by dial code, then name, so the common
 *  groupings (all the +1s, all the +44-adjacent, ...) sit together. */
export const DIAL_CODE_OPTIONS: DialCodeOption[] = COUNTRIES.filter((c) => DIAL_CODES[c.code]).map((c) => ({
  code: c.code,
  name: c.name,
  dialCode: DIAL_CODES[c.code],
}));

/** IANA timezone identifiers. Uses the runtime's own list when the browser
 *  supports it (Intl.supportedValuesOf) so it's always current; falls back
 *  to a curated common-zones list otherwise. */
export function getTimezones(): string[] {
  try {
    const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intlAny.supportedValuesOf === 'function') {
      return intlAny.supportedValuesOf('timeZone');
    }
  } catch {
    // fall through to the static list below
  }
  return FALLBACK_TIMEZONES;
}

/** ISO 4217 currency codes with a human-readable name, for the Organization
 *  Settings currency dropdown — the selection that drives money formatting
 *  everywhere financial (Payroll, payslips, employee salary figures). Same
 *  runtime-Intl-with-fallback pattern as getTimezones() above. */
export function getCurrencies(): Array<{ code: string; name: string }> {
  try {
    const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intlAny.supportedValuesOf === 'function') {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
      return intlAny
        .supportedValuesOf('currency')
        .map((code) => ({ code, name: displayNames.of(code) ?? code }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    // fall through to the static list below
  }
  return FALLBACK_CURRENCIES;
}

const FALLBACK_CURRENCIES = [
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'EUR', name: 'Euro' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'CAD', name: 'Canadian Dollar' },
].sort((a, b) => a.name.localeCompare(b.name));

const FALLBACK_TIMEZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Lusaka',
  'Africa/Nairobi',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Pacific/Auckland',
  'Pacific/Fiji',
];

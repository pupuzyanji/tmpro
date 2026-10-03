/** v031.A — the campaign a visitor came from, as captured on the public
 *  pages (web: lib/analytics.ts) and sent with events and sign-up forms. */
export interface Touch {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  slug: string | null;
  referrer: string | null;
  landing: string | null;
  at: string | null;
}

export interface Attribution {
  visitorId: string | null;
  first: Touch;
  last: Touch;
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
};

export function cleanTouch(raw: unknown): Touch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    source: (str(r.source, 80) ?? 'direct').toLowerCase(),
    medium: str(r.medium, 80)?.toLowerCase() ?? null,
    campaign: str(r.campaign, 120),
    content: str(r.content, 160),
    slug: str(r.slug, 80),
    referrer: str(r.referrer, 300),
    landing: str(r.landing, 300),
    at: str(r.at, 40),
  };
}

/** Never trusts the shape the browser sent: every field is re-read, trimmed
 *  and length-capped, and anything unexpected is dropped. */
export function cleanAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const last = cleanTouch(r.last) ?? cleanTouch(r.first);
  const first = cleanTouch(r.first) ?? last;
  if (!first || !last) return null;
  return { visitorId: str(r.visitorId, 64), first, last };
}

const BOT = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|slack|telegram|discord|skype|embedly|curl|wget|python|headless|lighthouse|monitor/i;
export const isBot = (ua: string | undefined | null) => !ua || BOT.test(ua);
export const deviceOf = (ua: string | undefined | null) =>
  !ua ? null : /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop';

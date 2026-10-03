// v031.A — campaign tracking for tmPro's public pages (login, pricing,
// register, careers, support). Three parts:
//   1. Attribution: the campaign tags on the link someone arrived by are
//      remembered (first and last touch) and sent with the sign-up form.
//   2. Funnel events: anonymous counts (visit, pricing view, plan click,
//      sign-up) posted to tmPro's own API for Platform Admin → Sources.
//   3. PostHog: page analytics and session recordings — only after the
//      visitor accepts the consent banner, and never inside the signed-in
//      app (recordings there would capture staff and payroll data).
import { apiFetch } from './api';

/** PostHog project key — public by design (it ships in the page code). */
export const POSTHOG_KEY = 'phc_xAmxXfPpaWVUJ68kaVvjTpHrcb7LkWbS7LNpG48W5J49';
/** PostHog region: 'https://us.i.posthog.com' or 'https://eu.i.posthog.com'.
 *  Must match the region the PostHog project was created in. */
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

const PUBLIC_PREFIXES = ['/login', '/pricing', '/register-organisation', '/careers', '/support', '/privacy-policy', '/terms-of-service'];
export const isPublicPath = (path: string) => PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

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
export type Consent = 'yes' | 'no' | null;

const CONSENT_KEY = 'tmpro:consent';
const VISITOR_KEY = 'tmpro:visitor';
const FIRST_KEY = 'tmpro:first-touch';
const LAST_KEY = 'tmpro:last-touch';

const read = (store: Storage, key: string) => {
  try { return store.getItem(key); } catch { return null; }
};
const write = (store: Storage, key: string, value: string) => {
  try { store.setItem(key, value); } catch { /* storage unavailable — tracking is best-effort */ }
};
const parse = (raw: string | null): Touch | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as Touch; } catch { return null; }
};

export function getConsent(): Consent {
  if (typeof window === 'undefined') return null;
  const v = read(localStorage, CONSENT_KEY);
  return v === 'yes' || v === 'no' ? v : null;
}

/** Without consent the campaign is kept for this browser tab only and no
 *  visitor id is created; with consent it is remembered across visits. */
const store = () => (getConsent() === 'yes' ? localStorage : sessionStorage);

function visitorId(): string | null {
  if (getConsent() !== 'yes') return null;
  let id = read(localStorage, VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    write(localStorage, VISITOR_KEY, id);
  }
  return id;
}

function currentTouch(): Touch | null {
  const q = new URLSearchParams(window.location.search);
  const ref = document.referrer;
  let refHost: string | null = null;
  try {
    const h = ref ? new URL(ref).hostname : '';
    refHost = h && h !== window.location.hostname ? h.replace(/^www\./, '') : null;
  } catch { /* malformed referrer */ }
  const source = q.get('utm_source');
  if (!source && !refHost) return null; // nothing new to learn from this page view
  return {
    source: (source ?? refHost ?? 'direct').toLowerCase(),
    medium: q.get('utm_medium') ?? (source ? null : 'referral'),
    campaign: q.get('utm_campaign'),
    content: q.get('utm_content'),
    slug: q.get('tl'),
    referrer: refHost,
    landing: window.location.pathname,
    at: new Date().toISOString(),
  };
}

const DIRECT = (): Touch => ({
  source: 'direct', medium: null, campaign: null, content: null, slug: null, referrer: null,
  landing: window.location.pathname, at: new Date().toISOString(),
});

/** Call on every public page view. Records the campaign on the link (if
 *  any) as the last touch, and as the first touch if there isn't one yet. */
export function captureTouch() {
  const s = store();
  const touch = currentTouch();
  if (touch) write(s, LAST_KEY, JSON.stringify(touch));
  if (!read(s, FIRST_KEY)) write(s, FIRST_KEY, JSON.stringify(touch ?? DIRECT()));
}

export function getAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  const s = store();
  const first = parse(read(s, FIRST_KEY)) ?? parse(read(sessionStorage, FIRST_KEY));
  if (!first) return null;
  const last = parse(read(s, LAST_KEY)) ?? parse(read(sessionStorage, LAST_KEY)) ?? first;
  return { visitorId: visitorId(), first, last };
}

type PostHog = typeof import('posthog-js').default;
let posthog: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

/** Loads PostHog on first use — only with consent, only on a public page. */
function loadPosthog(): Promise<PostHog | null> {
  if (getConsent() !== 'yes') return Promise.resolve(null);
  if (posthog) return Promise.resolve(posthog);
  if (!loading) {
    loading = import('posthog-js')
      .then(({ default: ph }) => {
        ph.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          person_profiles: 'identified_only',
          capture_pageview: false, // sent by hand below, public pages only
          capture_pageleave: true,
          autocapture: true,
          disable_session_recording: true, // started by hand on public pages
          session_recording: { maskAllInputs: true },
          persistence: 'localStorage+cookie',
        });
        posthog = ph;
        return ph;
      })
      .catch(() => null);
  }
  return loading;
}

/** A public page was viewed. */
export async function trackPublicPage(path: string) {
  const ph = await loadPosthog();
  if (!ph) return;
  ph.opt_in_capturing();
  ph.startSessionRecording();
  ph.capture('$pageview');
  void path;
}

/** The visitor moved into the signed-in app (or Platform Admin): stop
 *  recording and capturing entirely. */
export function pausePosthog() {
  if (!posthog) return;
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
}

export type FunnelEvent = 'visit' | 'pricing_view' | 'plan_click' | 'signup';

/** Posts an anonymous funnel event to tmPro's own API, and mirrors it to
 *  PostHog when that is running. Never throws. */
export function track(type: FunnelEvent, detail?: string) {
  if (typeof window === 'undefined') return;
  const attribution = getAttribution();
  apiFetch('/marketing/event', null, {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify({ type, path: window.location.pathname, detail, attribution: attribution ?? undefined }),
  }).catch(() => undefined);
  if (type !== 'visit') posthog?.capture(type, detail ? { detail } : undefined);
}

/** After a sign-up: tell PostHog who this visitor is, which also joins up
 *  their history on any other device where they later sign up or sign in. */
export function identifySignup(email: string, organisation: string) {
  posthog?.identify(email.trim().toLowerCase(), { email: email.trim().toLowerCase(), organisation });
}

export function setConsent(value: 'yes' | 'no') {
  write(localStorage, CONSENT_KEY, value);
  if (value === 'yes') {
    // Carry this tab's campaign over to the remembered copy.
    for (const key of [FIRST_KEY, LAST_KEY]) {
      const v = read(sessionStorage, key);
      if (v && !(key === FIRST_KEY && read(localStorage, key))) write(localStorage, key, v);
    }
    void trackPublicPage(window.location.pathname);
  }
}

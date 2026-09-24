'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiError } from '@/lib/api';
import { Logo, LogoHero } from '@/components/logo';
import { IconDollar, IconCalendar, IconGlobe, IconShield } from '@/components/icons';
import { LoginHeroComposite } from '@/components/login-hero-composite';

// The hero panel's background — "Version 4: deep navy with brand glows" from
// the four gradient options shown alongside the rebuilt composite graphic
// (see LoginHeroComposite). Deliberately fixed rather than `bg-brand-gradient`
// (which flips with the dashboard's light/midnight theme toggle): this panel
// is marketing artwork shown to signed-out visitors, who have no theme
// preference set, so it shouldn't vary with one.
const HERO_BACKGROUND = [
  'radial-gradient(560px 420px at 0% 0%, rgba(20,184,240,0.55), transparent 60%)',
  'radial-gradient(620px 480px at 100% 100%, rgba(255,138,30,0.4), transparent 60%)',
  'radial-gradient(500px 400px at 100% 0%, rgba(214,38,201,0.35), transparent 60%)',
  'linear-gradient(160deg, #14122b 0%, #0d0b1a 100%)',
].join(', ');

/** One tenant match returned by POST /auth/identify for a given email. */
interface TenantMatch {
  tenantSlug: string;
  tenantName: string;
  logoUrl: string | null;
  displayName: string | null;
}

const FEATURES: Array<{ label: string; icon: React.ReactNode }> = [
  { label: 'Configurable payroll — pay rate, allowances & tax rules in one engine', icon: <IconDollar /> },
  { label: 'Leave & attendance with country-specific leave types', icon: <IconCalendar /> },
  { label: 'Native rulesets for multiple countries, more pluggable', icon: <IconGlobe /> },
  { label: 'Regulatory submissions generated straight from payroll runs', icon: <IconShield /> },
];

const TRUSTED_BY: Array<{ src: string; alt: string; country: string }> = [
  { src: '/trusted-riverbird.png', alt: 'Riverbird Technology Partners', country: 'South Africa' },
  { src: '/trusted-renaisense.png', alt: 'Renaisense', country: 'Zambia' },
  { src: '/trusted-byteware.png', alt: 'ByteWare', country: 'Australia' },
  { src: '/trusted-riverware.png', alt: 'RiverWare', country: 'Malawi' },
];

// Triangle layout for the three ring portraits — same coordinate scheme as
// the approved design mockup (top, bottom-left, bottom-right), connected
// pairwise by dotted lines.
const TRIANGLE_BOX = { w: 226, h: 158 };
const TRIANGLE_POINTS = [
  { x: TRIANGLE_BOX.w / 2, y: 20 },
  { x: 30, y: TRIANGLE_BOX.h - 16 },
  { x: TRIANGLE_BOX.w - 30, y: TRIANGLE_BOX.h - 16 },
];
const TRIANGLE_PORTRAITS = ['/login-portrait-1.jpg', '/login-portrait-2.jpg', '/login-portrait-3.jpg'];
const TRIANGLE_PAIRS: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 2],
];

function TrianglePortraits() {
  return (
    <div className="relative mb-4" style={{ width: TRIANGLE_BOX.w, height: TRIANGLE_BOX.h }}>
      <svg
        width={TRIANGLE_BOX.w}
        height={TRIANGLE_BOX.h}
        viewBox={`0 0 ${TRIANGLE_BOX.w} ${TRIANGLE_BOX.h}`}
        className="absolute left-0 top-0 z-0"
      >
        {TRIANGLE_PAIRS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={TRIANGLE_POINTS[a].x}
            y1={TRIANGLE_POINTS[a].y}
            x2={TRIANGLE_POINTS[b].x}
            y2={TRIANGLE_POINTS[b].y}
            stroke="var(--accent)"
            strokeOpacity={0.32}
            strokeWidth={1.5}
            strokeDasharray="3 5"
          />
        ))}
      </svg>
      {TRIANGLE_POINTS.map((p, i) => (
        <div
          key={i}
          className="absolute z-10 rounded-full p-[3px] shadow-md"
          style={{ left: p.x, top: p.y, width: 64, height: 64, transform: 'translate(-50%, -50%)', background: 'var(--accent)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={TRIANGLE_PORTRAITS[i]}
            alt=""
            className="h-full w-full rounded-full border-2 border-white object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function TrustedByStrip() {
  return (
    <div className="pb-9 pt-6 text-center">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Trusted by teams across</p>
      <div className="flex items-center justify-center gap-7">
        {TRUSTED_BY.map((t) => (
          <div key={t.country} className="flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.src} alt={t.alt} className="h-5 w-auto" />
            <span className="text-[10px] font-semibold text-slate-500">{t.country}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  // Identifier-first login: email -> (org picker, only if the email is
  // shared across tenants) -> password. Nobody types an organization slug
  // anymore — see the "username first login" discussion this replaces.
  const [step, setStep] = useState<'email' | 'picker' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [matches, setMatches] = useState<TenantMatch[]>([]);
  const [selected, setSelected] = useState<TenantMatch | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function identify(candidateEmail: string) {
    const trimmed = candidateEmail.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      // Email is case-insensitive throughout tmPro, so this matches however
      // it was typed — no need to normalize case here before sending it.
      const result = await apiFetch<{ matches: TenantMatch[] }>('/auth/identify', null, {
        method: 'POST',
        body: JSON.stringify({ email: trimmed }),
      });
      setEmail(trimmed);
      if (result.matches.length === 0) {
        setError("We couldn't find an account with that email.");
      } else if (result.matches.length === 1) {
        setSelected(result.matches[0]);
        setMatches(result.matches);
        setStep('password');
      } else {
        setMatches(result.matches);
        setStep('picker');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Is the API running?');
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    identify(email);
  }

  function chooseTenant(match: TenantMatch) {
    setSelected(match);
    setError(null);
    setStep('password');
  }

  function useDifferentEmail() {
    setStep('email');
    setMatches([]);
    setSelected(null);
    setPassword('');
    setError(null);
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(selected.tenantSlug, email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Is the API running?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Marketing panel — hidden below lg, where the form alone takes the full screen */}
      <div
        className="relative hidden shrink-0 flex-col overflow-hidden px-12 py-12 text-white lg:flex lg:w-[58%] xl:px-16"
        style={{ background: HERO_BACKGROUND }}
      >
        <div className="mb-9 flex items-center gap-2.5">
          <Logo />
        </div>
        <h1 className="max-w-lg text-[32px] font-extrabold leading-[1.18] tracking-tight">
          People Ops and Payroll that flex to every country you hire in.
        </h1>
        <p className="mt-3.5 max-w-md text-sm leading-relaxed text-white/90">
          Configurable payroll rulesets, leave policies, and statutory filings — native to your country today! Built
          to extend to wherever you grow next.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15">
                {f.icon}
              </span>
              <span className="text-xs font-medium">{f.label}</span>
            </div>
          ))}
        </div>
        <div className="-ml-12 mt-8 w-full max-w-[560px] self-start pl-6 xl:-ml-16">
          <LoginHeroComposite />
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-1 flex-col bg-white px-6 py-10">
        {/* Mobile hero summary — the marketing panel above is desktop-only
            (hidden below `lg`), so a narrow viewport used to show none of
            it: no logo, no headline, no feature list. This condenses the
            same content (logo, headline, subhead, the four features) into a
            banner shown only below `lg`, right above the sign-in form. */}
        <div className="-mx-6 -mt-10 mb-8 px-6 pb-6 pt-8 text-white lg:hidden" style={{ background: HERO_BACKGROUND }}>
          <Logo />
          <h1 className="mt-4 text-xl font-extrabold leading-snug tracking-tight">
            People Ops and Payroll that flex to every country you hire in.
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-white/90">
            Configurable payroll rulesets, leave policies, and statutory filings — native to your country today!
            Built to extend to wherever you grow next.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                  {f.icon}
                </span>
                <span className="text-[11px] font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <TrianglePortraits />
          <LogoHero className="mb-6" />

          {step === 'email' && (
            <form onSubmit={onSubmitEmail} className="card w-full max-w-sm space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoFocus
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {step === 'picker' && (
            <div className="card w-full max-w-sm space-y-3">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-ink">{email}</span> is used at more than one organization. Which one
                are you signing in to?
              </p>
              <div className="space-y-2">
                {matches.map((m) => (
                  <button
                    key={m.tenantSlug}
                    type="button"
                    onClick={() => chooseTenant(m)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-brand-blue hover:bg-slate-50"
                  >
                    {m.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-500">
                        {m.tenantName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm font-medium text-ink">{m.tenantName}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={useDifferentEmail} className="text-xs font-medium text-brand-blue underline">
                Use a different email
              </button>
            </div>
          )}

          {step === 'password' && selected && (
            <form onSubmit={onSubmitPassword} className="card w-full max-w-sm space-y-4">
              <div className="flex flex-col items-center gap-1.5 text-center">
                {selected.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.logoUrl} alt="" className="mb-1 h-10 w-10 rounded object-contain" />
                ) : null}
                <p className="text-sm font-semibold text-ink">{selected.tenantName}</p>
                <p className="text-xs text-slate-500">
                  {selected.displayName ? `Welcome back, ${selected.displayName}` : `Signing in as ${email}`}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoFocus
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" onClick={useDifferentEmail} className="w-full text-center text-xs font-medium text-brand-blue underline">
                Not you? Use a different email
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-slate-400">
            New to tmPro?{' '}
            <a className="font-semibold text-ink underline decoration-slate-300 hover:text-brand-blue" href="/pricing">
              See plans &amp; start a free trial
            </a>
          </p>

          <p className="mt-4 text-center text-xs text-slate-400">
            Applying for a role instead?{' '}
            <a className="font-medium text-brand-blue underline" href="/careers">
              Go to the careers page
            </a>
            .
          </p>
        </div>

        <TrustedByStrip />
      </div>
    </div>
  );
}

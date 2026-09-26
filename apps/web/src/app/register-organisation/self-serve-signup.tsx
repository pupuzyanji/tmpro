'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { Logo } from '@/components/logo';
import { IconCheckCircle, IconShield } from '@/components/icons';
import { COUNTRIES, DIAL_CODE_OPTIONS } from '@/lib/reference-data';
import { BANDS, BAND_KEYS, PLANS, PLAN_KEYS, PRICES_USD, TRIAL_DAYS, formatUsd, type BandKey, type PlanKey } from '@/lib/billing-plans';

/** v025.A — self-serve sign-up: organisation + first Admin login, then off
 *  to Stripe Checkout for the card. Reached from the pricing page with
 *  ?plan=GROWTH&band=B50 (both changeable here). */
export function SelfServeSignup({ initialPlan, initialBand }: { initialPlan: PlanKey; initialBand: BandKey }) {
  const [plan, setPlan] = useState<PlanKey>(initialPlan);
  const [band, setBand] = useState<BandKey>(initialBand);
  const [organisationName, setOrganisationName] = useState('');
  const [country, setCountry] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dialCode, setDialCode] = useState('+260');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = PRICES_USD[plan][band];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    if (password !== confirm) return setError("The two passwords don't match.");
    if (!agree) return setError('Please accept the terms to continue.');
    setBusy(true);
    try {
      const res = await apiFetch<{ checkoutUrl: string }>('/billing/signup', null, {
        method: 'POST',
        body: JSON.stringify({
          plan,
          band,
          organisationName,
          country,
          firstName,
          lastName,
          email,
          phone: `${dialCode} ${phoneNumber.trim()}`,
          password,
        }),
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Order summary panel */}
      <div
        className="relative hidden shrink-0 flex-col justify-between overflow-hidden px-12 py-12 text-white lg:flex lg:w-[42%] xl:px-16"
        style={{
          background: [
            'radial-gradient(560px 420px at 0% 0%, rgba(20,184,240,0.55), transparent 60%)',
            'radial-gradient(620px 480px at 100% 100%, rgba(255,138,30,0.4), transparent 60%)',
            'radial-gradient(500px 400px at 100% 0%, rgba(214,38,201,0.35), transparent 60%)',
            'linear-gradient(160deg, #14122b 0%, #0d0b1a 100%)',
          ].join(', '),
        }}
      >
        <div>
          <div className="mb-10">
            <Logo />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Your plan</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            tmPro {PLANS[plan].name}
          </h1>
          <p className="mt-1 text-sm text-white/75">{BANDS[band].label}</p>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="text-5xl font-extrabold">{formatUsd(price)}</span>
            <span className="text-white/70">/ month</span>
          </p>
          <p className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            {TRIAL_DAYS} days free — first charge after your trial
          </p>
          <ul className="mt-8 space-y-2.5 text-sm">
            {PLANS[plan].modules.map((m) => (
              <li key={m} className="flex items-center gap-2.5 text-white/90">
                <IconCheckCircle />
                {m}
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/60">
          <IconShield /> Card details are entered on Stripe&apos;s secure page — tmPro never sees them.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col items-center bg-white px-6 py-10">
        <div className="w-full max-w-lg">
          <div className="mb-6 flex items-center justify-between">
            <Link href="/pricing" className="text-sm font-medium text-slate-500 hover:text-ink">
              ← Back to pricing
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-ink">Create your tmPro workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set up your organisation and admin login. You&apos;ll add your card on the next step — nothing is charged
            for {TRIAL_DAYS} days.
          </p>

          <form onSubmit={onSubmit} className="card mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="plan">
                  Plan
                </label>
                <select id="plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)}>
                  {PLAN_KEYS.map((p) => (
                    <option key={p} value={p}>
                      {PLANS[p].name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="band">
                  Company size
                </label>
                <select id="band" className="input" value={band} onChange={(e) => setBand(e.target.value as BandKey)}>
                  {BAND_KEYS.map((b) => (
                    <option key={b} value={b}>
                      {BANDS[b].label} — {formatUsd(PRICES_USD[plan][b])}/mo
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="-mt-2 text-xs text-slate-400">
              More than 200 employees?{' '}
              <Link href="/register-organisation?contact=1" className="font-medium text-brand-blue underline">
                Contact us
              </Link>{' '}
              for custom pricing.
            </p>

            <div>
              <label className="label" htmlFor="org">
                Organisation name
              </label>
              <input id="org" className="input" value={organisationName} onChange={(e) => setOrganisationName(e.target.value)} placeholder="Acme Group" required />
            </div>

            <div>
              <label className="label" htmlFor="country">
                Country
              </label>
              <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} required>
                <option value="" disabled>
                  Select a country
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="first">
                  Your first name
                </label>
                <input id="first" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="last">
                  Last name
                </label>
                <input id="last" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="email">
                Work email (your admin login)
              </label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" required />
            </div>

            <div>
              <label className="label" htmlFor="phone">
                Phone number
              </label>
              <div className="flex gap-2">
                <select aria-label="Country code" className="input !w-[6.5rem] shrink-0 !px-2" value={dialCode} onChange={(e) => setDialCode(e.target.value)}>
                  {DIAL_CODE_OPTIONS.map((d) => (
                    <option key={d.code} value={d.dialCode}>
                      {d.dialCode} {d.code}
                    </option>
                  ))}
                </select>
                <input id="phone" type="tel" className="input min-w-0 flex-1" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="971234567" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pw">
                  Password
                </label>
                <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              </div>
              <div>
                <label className="label" htmlFor="pw2">
                  Confirm password
                </label>
                <input id="pw2" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree to tmPro&apos;s{' '}
                <Link href="/terms-of-service" target="_blank" className="font-medium text-brand-blue underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy-policy" target="_blank" className="font-medium text-brand-blue underline">
                  Privacy Policy
                </Link>
                , and understand my card will be charged {formatUsd(price)} per month after the {TRIAL_DAYS}-day trial
                unless I cancel.
              </span>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" className="btn-primary w-full !py-2.5" disabled={busy}>
              {busy ? 'Taking you to secure checkout…' : 'Continue to payment'}
            </button>
            <p className="text-center text-xs text-slate-400">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-brand-blue underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

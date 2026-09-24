'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { IconCheckCircle } from '@/components/icons';
import {
  BANDS,
  BAND_KEYS,
  PICKER_CURRENCIES,
  PLANS,
  PLAN_KEYS,
  PRICES_USD,
  TRIAL_DAYS,
  detectVisitorLocale,
  formatMoney,
  formatUsd,
  roundEstimate,
  type BandKey,
  type PlanKey,
} from '@/lib/billing-plans';

type BandChoice = BandKey | 'ENTERPRISE';

interface Fx {
  base: string;
  rates: Record<string, number> | null;
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'How is company size counted?',
    a: 'By the number of current employees in tmPro — everyone except people you have marked as former staff. Admins, supervisors and employees all count once, whether or not they ever log in.',
  },
  {
    q: 'What happens when we grow past our band?',
    a: "tmPro lets you know as you approach the limit. Moving up a band is one click in Settings → Billing, and you only pay the difference for the rest of the month. There's never a surprise charge.",
  },
  {
    q: 'Which currency will I be charged in?',
    a: "Prices are set in US dollars. At checkout, cards from most countries — including Zambia, South Africa, Tanzania, New Zealand, the UK and the EU — can pay in their local currency at a rate shown before you confirm. You can always choose to pay in USD instead.",
  },
  {
    q: 'How do I pay?',
    a: 'Monthly by Visa or Mastercard, credit or debit. Card details are handled securely by Stripe — tmPro never sees or stores your card number. Invoices are emailed each month and available in Settings → Billing.',
  },
  {
    q: 'Is there a free trial?',
    a: `Yes — every plan starts with a ${TRIAL_DAYS}-day free trial. Your card is only charged when the trial ends, and you can cancel before then at no cost.`,
  },
  {
    q: 'Can I change plan or cancel?',
    a: 'Any time. Upgrades apply immediately; downgrades apply from your next invoice. Cancelling stops renewal at the end of the month you have paid for.',
  },
];

function PricingPageInner() {
  const params = useSearchParams();
  const cancelled = params.get('cancelled') === '1';
  const [band, setBand] = useState<BandChoice>('B20');
  const [currency, setCurrency] = useState('USD');
  const [detected, setDetected] = useState<{ countryName: string | null; currency: string } | null>(null);
  const [fx, setFx] = useState<Fx | null>(null);

  useEffect(() => {
    const loc = detectVisitorLocale();
    setDetected(loc);
    setCurrency(loc.currency);
    apiFetch<Fx>('/billing/fx', null)
      .then(setFx)
      .catch(() => setFx({ base: 'USD', rates: null }));
  }, []);

  const rate = currency !== 'USD' ? fx?.rates?.[currency] ?? null : null;
  const local = (usd: number) => (rate ? formatMoney(roundEstimate(usd * rate), currency) : null);
  const pickerOptions = useMemo(() => {
    const set = new Set(PICKER_CURRENCIES);
    if (detected?.currency) set.add(detected.currency);
    return [...set].filter((c) => c === 'USD' || fx?.rates?.[c]);
  }, [detected, fx]);

  return (
    <div className="min-h-screen bg-[#f7f6fc]">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/pricing" className="flex items-center">
          <Image src="/logo-full.png" alt="tmPro" width={120} height={42} priority />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/careers" className="hidden text-slate-500 hover:text-ink sm:inline">
            Careers
          </Link>
          <Link href="/login" className="font-medium text-slate-600 hover:text-ink">
            Sign in
          </Link>
          <a href="#plans" className="btn-primary">
            Start free trial
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(600px 300px at 15% 0%, rgba(20,184,240,0.18), transparent 60%), radial-gradient(600px 320px at 85% 10%, rgba(214,38,201,0.14), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-8 pt-10 text-center">
          <p className="mx-auto mb-4 inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#8b2fd9] shadow-sm">
            Pricing
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Simple pricing that <span className="bg-brand-gradient bg-clip-text text-transparent">grows with your team</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
            One flat monthly price for your company size — not per user. {TRIAL_DAYS}-day free trial on every plan, pay
            monthly by Visa or Mastercard, cancel any time.
          </p>
          {cancelled && (
            <p className="mx-auto mt-5 max-w-md rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Checkout was cancelled — nothing was charged. Pick a plan whenever you&apos;re ready.
            </p>
          )}
        </div>
      </section>

      {/* Controls */}
      <section id="plans" className="mx-auto max-w-6xl scroll-mt-6 px-6">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-ink">How many employees do you have?</p>
          <div className="flex flex-wrap justify-center gap-1 rounded-2xl bg-white p-1.5 shadow-card">
            {[...BAND_KEYS, 'ENTERPRISE' as const].map((b) => {
              const active = band === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBand(b)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                    active ? 'bg-brand-gradient text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {b === 'ENTERPRISE' ? '200+' : BANDS[b].short}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span>Prices in USD</span>
            {pickerOptions.length > 1 && (
              <>
                <span>·</span>
                <label htmlFor="cur">Show estimate in</label>
                <select
                  id="cur"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-ink"
                >
                  {pickerOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {detected?.countryName && detected.currency === currency && currency !== 'USD' && (
                  <span>(based on your location: {detected.countryName})</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Plan cards */}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PLAN_KEYS.map((plan, i) => {
            const p = PLANS[plan];
            const enterprise = band === 'ENTERPRISE';
            const usd = enterprise ? null : PRICES_USD[plan][band as BandKey];
            const prevModules = i > 0 ? PLANS[PLAN_KEYS[i - 1]].modules : [];
            return (
              <div
                key={plan}
                className={`relative flex flex-col rounded-3xl bg-white p-7 shadow-card ${
                  p.highlight ? 'ring-2 ring-[#8b2fd9]' : 'border border-slate-100'
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-extrabold text-ink">{p.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{p.tagline}</p>

                <div className="mt-6 min-h-[92px]">
                  {usd != null ? (
                    <>
                      <p className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-extrabold tracking-tight text-ink">{formatUsd(usd)}</span>
                        <span className="text-sm font-medium text-slate-500">/ month</span>
                      </p>
                      {local(usd) && (
                        <p className="mt-1 text-sm font-semibold text-[#8b2fd9]">
                          ≈ {local(usd)} <span className="font-normal text-slate-400">/ month</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-400">For up to {BANDS[band as BandKey].max} employees</p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl font-extrabold tracking-tight text-ink">Custom</p>
                      <p className="mt-1 text-xs text-slate-400">For 200+ employees — tailored pricing and onboarding</p>
                    </>
                  )}
                </div>

                {usd != null ? (
                  <Link
                    href={`/register-organisation?plan=${plan}&band=${band}`}
                    className={`mt-5 w-full ${p.highlight ? 'btn-primary' : 'btn-secondary'} !py-2.5`}
                  >
                    Start {TRIAL_DAYS}-day free trial
                  </Link>
                ) : (
                  <Link href={`/register-organisation?contact=1&plan=${plan}`} className="btn-secondary mt-5 w-full !py-2.5">
                    Contact us
                  </Link>
                )}

                <ul className="mt-6 space-y-2.5 text-sm">
                  {p.modules.map((m) => {
                    const isNew = i > 0 && !prevModules.includes(m);
                    return (
                      <li key={m} className="flex items-start gap-2.5">
                        <span className={isNew ? 'text-[#8b2fd9]' : 'text-emerald-500'}>
                          <IconCheckCircle />
                        </span>
                        <span className={isNew ? 'font-semibold text-ink' : 'text-slate-600'}>{m}</span>
                      </li>
                    );
                  })}
                  <li className="flex items-start gap-2.5">
                    <span className="text-emerald-500">
                      <IconCheckCircle />
                    </span>
                    <span className="text-slate-600">Unlimited logins for staff &amp; managers</span>
                  </li>
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {currency !== 'USD' && rate
            ? `Local amounts are estimates at today's rate (about US$1 = ${formatMoney(rate, currency)}). The exact amount is shown at checkout before you pay.`
            : 'All prices are monthly, in US dollars.'}{' '}
          Taxes may apply depending on your country.
        </p>
      </section>

      {/* Full grid */}
      <section className="mx-auto mt-14 max-w-6xl px-6">
        <h2 className="text-center text-xl font-bold text-ink">Every plan, every size</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3.5">Employees</th>
                {PLAN_KEYS.map((p) => (
                  <th key={p} className="px-5 py-3.5">
                    {PLANS[p].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BAND_KEYS.map((b) => (
                <tr key={b} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3.5 font-semibold text-ink">{BANDS[b].short}</td>
                  {PLAN_KEYS.map((p) => (
                    <td key={p} className="px-5 py-3.5">
                      <span className="font-semibold text-ink">{formatUsd(PRICES_USD[p][b])}</span>
                      <span className="text-slate-400"> /mo</span>
                      {local(PRICES_USD[p][b]) && (
                        <span className="block text-xs text-slate-400">≈ {local(PRICES_USD[p][b])}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-5 py-3.5 font-semibold text-ink">200+</td>
                <td colSpan={3} className="px-5 py-3.5 text-slate-500">
                  Custom pricing —{' '}
                  <Link href="/register-organisation?contact=1" className="font-semibold text-[#8b2fd9] underline">
                    contact us
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-14 max-w-3xl px-6 pb-20">
        <h2 className="text-center text-xl font-bold text-ink">Questions</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-white px-5 py-4 shadow-card">
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink">
                <span className="flex items-center justify-between">
                  {f.q}
                  <span className="text-slate-400 transition-transform group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-10 text-center text-xs text-slate-400">
          Payments are processed securely by Stripe. Visa and Mastercard credit and debit cards accepted.
        </p>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageInner />
    </Suspense>
  );
}

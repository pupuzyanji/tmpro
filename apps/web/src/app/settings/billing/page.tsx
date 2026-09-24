'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { IconCheckCircle } from '@/components/icons';
import {
  BANDS,
  BAND_KEYS,
  PLANS,
  PLAN_KEYS,
  PRICES_USD,
  formatUsd,
  isBandKey,
  isPlanKey,
  type BandKey,
  type PlanKey,
} from '@/lib/billing-plans';

interface Summary {
  organisationName: string;
  plan: string | null;
  band: string | null;
  billingStatus: string;
  selfServe: boolean;
  monthlyPriceUsd: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  seatsUsed: number;
  seatCap: number | null;
  recommendedBand: string | null;
  nextBand: string | null;
  enabledModules?: string[];
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  TRIALING: { label: 'Free trial', cls: 'bg-sky-50 text-sky-700' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
  PAST_DUE: { label: 'Payment failed', cls: 'bg-red-50 text-red-700' },
  UNPAID: { label: 'Unpaid', cls: 'bg-red-50 text-red-700' },
  CANCELED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600' },
  INCOMPLETE: { label: 'Incomplete', cls: 'bg-amber-50 text-amber-700' },
  PAUSED: { label: 'Paused', cls: 'bg-slate-100 text-slate-600' },
  MANUAL: { label: 'Managed by tmPro', cls: 'bg-violet-50 text-violet-700' },
};

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}

/** v025.A — Settings → Billing (Admin only): current plan, usage against
 *  the band's employee limit, one-click plan/band changes, and the Stripe
 *  Customer Portal for card details and invoices. */
export default function BillingSettingsPage() {
  const { call, session } = useApi();
  const { updateEnabledModules } = useAuth();
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pick, setPick] = useState<{ plan: PlanKey; band: BandKey } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewBand, setViewBand] = useState<BandKey>('B20');

  const load = useCallback(async () => {
    try {
      const data = await call<Summary>('/billing/summary');
      setS(data);
      if (isBandKey(data.band)) setViewBand(data.band);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load billing.');
    }
  }, [call]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (session && session.user.role !== 'ADMIN') {
    return <p className="text-sm text-slate-500">Billing is managed by your organisation&apos;s Admin.</p>;
  }
  if (error && !s) return <p className="text-sm text-red-600">{error}</p>;
  if (!s) return <p className="text-sm text-slate-400">Loading…</p>;

  const plan = isPlanKey(s.plan) ? s.plan : null;
  const band = isBandKey(s.band) ? s.band : null;
  const status = STATUS_STYLE[s.billingStatus] ?? { label: s.billingStatus, cls: 'bg-slate-100 text-slate-600' };
  const pct = s.seatCap ? Math.min(100, Math.round((s.seatsUsed / s.seatCap) * 100)) : 0;
  const nearLimit = s.seatCap != null && s.seatsUsed >= Math.floor(s.seatCap * 0.9);

  async function openPortal() {
    setBusy(true);
    try {
      const { url } = await call<{ url: string }>('/billing/portal', { method: 'POST' });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open billing portal.');
      setBusy(false);
    }
  }

  async function confirmChange() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const res = await call<Summary>('/billing/change', { method: 'POST', body: JSON.stringify(pick) });
      if (res.enabledModules) updateEnabledModules(res.enabledModules);
      setS(res);
      setNotice(`You're now on ${PLANS[pick.plan].name} · ${BANDS[pick.band].label}.`);
      setPick(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change plan.');
    } finally {
      setBusy(false);
    }
  }

  async function contactSales() {
    setBusy(true);
    try {
      await call('/billing/contact-sales', { method: 'POST' });
      setNotice("Thanks — we've let the tmPro team know and they'll be in touch about 200+ pricing.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your request.');
    } finally {
      setBusy(false);
    }
  }

  const currentPrice = s.monthlyPriceUsd ?? 0;

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Current plan */}
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="label">Current plan</p>
              <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                {plan ? `tmPro ${PLANS[plan].name}` : 'Custom plan'}
              </h2>
              <p className="text-sm text-slate-500">{band ? BANDS[band].label : 'Set up by tmPro'}</p>
            </div>
            <span className={`badge ${status.cls}`}>{status.label}</span>
          </div>

          {s.selfServe ? (
            <>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-ink">{formatUsd(currentPrice)}</span>
                <span className="text-sm text-slate-500">USD / month</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {s.billingStatus === 'TRIALING' ? (
                  <div>
                    <dt className="text-xs text-slate-400">Trial ends</dt>
                    <dd className="font-semibold text-ink">{fmtDate(s.trialEndsAt)}</dd>
                  </div>
                ) : (
                  <div>
                    <dt className="text-xs text-slate-400">Next payment</dt>
                    <dd className="font-semibold text-ink">{fmtDate(s.currentPeriodEnd)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Payment method</dt>
                  <dd className="font-semibold text-ink">Card on file</dd>
                </div>
              </dl>
              {s.billingStatus === 'PAST_DUE' && (
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  Your last payment didn&apos;t go through. Update your card to keep tmPro running without interruption.
                </p>
              )}
              <button type="button" className="btn-primary mt-5" onClick={openPortal} disabled={busy}>
                Manage payment &amp; invoices
              </button>
              <p className="mt-2 text-xs text-slate-400">
                Update your card, download invoices or cancel — on Stripe&apos;s secure billing page.
              </p>
            </>
          ) : (
            <p className="mt-5 text-sm text-slate-500">
              Your subscription is managed directly by the tmPro team. To change your plan or billing details, email{' '}
              <a href="mailto:us@bitware.app" className="font-medium text-brand-blue underline">
                us@bitware.app
              </a>
              .
            </p>
          )}
        </div>

        <div className="card">
          <p className="label">Employees</p>
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-ink">{s.seatsUsed}</span>
            <span className="text-sm text-slate-500">{s.seatCap != null ? `of ${s.seatCap} on your plan` : 'no limit'}</span>
          </p>
          {s.seatCap != null && (
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${nearLimit ? 'bg-amber-500' : 'bg-brand-gradient'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Everyone in People counts, except former staff. Admins, supervisors and employees each count once.
          </p>
          {nearLimit && s.selfServe && plan && isBandKey(s.nextBand) && (
            <button
              type="button"
              className="btn-secondary mt-4 w-full"
              onClick={() => {
                setViewBand(s.nextBand as BandKey);
                setPick({ plan, band: s.nextBand as BandKey });
              }}
            >
              Move up to {BANDS[s.nextBand as BandKey].label}
            </button>
          )}
        </div>
      </div>

      {/* Change plan */}
      {s.selfServe && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-ink">Change plan</h3>
              <p className="text-sm text-slate-500">
                Upgrades apply now — you pay only the difference for the rest of this month. Downgrades apply from your
                next invoice.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-50 p-1">
              {BAND_KEYS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setViewBand(b)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    viewBand === b ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'
                  }`}
                >
                  {BANDS[b].short}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {PLAN_KEYS.map((p) => {
              const price = PRICES_USD[p][viewBand];
              const isCurrent = p === plan && viewBand === band;
              const tooSmall = s.seatsUsed > BANDS[viewBand].max;
              const direction = price > currentPrice ? 'Upgrade' : price < currentPrice ? 'Downgrade' : 'Switch';
              const selected = pick?.plan === p && pick?.band === viewBand;
              return (
                <div
                  key={p}
                  className={`flex flex-col rounded-2xl border p-5 ${
                    isCurrent ? 'border-[#8b2fd9] bg-violet-50/40' : selected ? 'border-[#8b2fd9]' : 'border-slate-200'
                  }`}
                >
                  <p className="text-sm font-bold text-ink">{PLANS[p].name}</p>
                  <p className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-ink">{formatUsd(price)}</span>
                    <span className="text-xs text-slate-500">/ month</span>
                  </p>
                  <p className="text-xs text-slate-400">Up to {BANDS[viewBand].max} employees</p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-xs text-slate-600">
                    {PLANS[p].modules.map((m) => (
                      <li key={m} className="flex items-center gap-1.5">
                        <span className="text-emerald-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
                          <IconCheckCircle />
                        </span>
                        {m}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <span className="mt-4 rounded-xl bg-white py-2 text-center text-sm font-semibold text-[#8b2fd9]">
                      Current plan
                    </span>
                  ) : tooSmall ? (
                    <span className="mt-4 py-2 text-center text-xs text-slate-400">
                      Too small for your {s.seatsUsed} employees
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`mt-4 ${direction === 'Upgrade' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setPick({ plan: p, band: viewBand })}
                      disabled={busy}
                    >
                      {direction} to {PLANS[p].name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {pick && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-5 py-4">
              <p className="text-sm text-ink">
                Switch to <b>{PLANS[pick.plan].name}</b> · {BANDS[pick.band].label} for{' '}
                <b>{formatUsd(PRICES_USD[pick.plan][pick.band])}/month</b>.{' '}
                <span className="text-slate-500">
                  {PRICES_USD[pick.plan][pick.band] > currentPrice
                    ? s.billingStatus === 'TRIALING'
                      ? 'No charge during your trial.'
                      : "The prorated difference is charged to your card today."
                    : 'The new price applies from your next invoice.'}
                </span>
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setPick(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={confirmChange} disabled={busy}>
                  {busy ? 'Updating…' : 'Confirm change'}
                </button>
              </div>
            </div>
          )}

          <p className="mt-5 text-sm text-slate-500">
            More than 200 employees?{' '}
            <button type="button" className="font-semibold text-[#8b2fd9] underline" onClick={contactSales} disabled={busy}>
              Ask us about custom pricing
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { usePlatformApi } from '@/lib/use-platform-api';
import { ApiError } from '@/lib/api';

// v031.A — Platform Admin → Sources and Links: which campaigns bring
// visitors and registrations, and the short links (/go/<name>) used to tag
// each place a link is shared.

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

const touchLabel = (t: Touch) => [t.source, t.medium, t.campaign, t.content].filter(Boolean).join(' / ');

/** "whatsapp / social / advert-70s / hr-lusaka", plus the first touch when
 *  something different introduced them. */
export function cameFrom(a: Attribution) {
  const last = touchLabel(a.last);
  const first = touchLabel(a.first);
  return first && first !== last ? `${last} (first seen via ${first})` : last;
}

interface SourceRow {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  visits: number;
  visitors: number;
  pricingViews: number;
  planClicks: number;
  registrations: number;
  trials: number;
  paying: number;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

export function SourcesTab() {
  const { ready, call } = usePlatformApi();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<SourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setRows(null);
    call<{ rows: SourceRow[] }>(`/platform-admin/marketing/sources?days=${days}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load sources.'));
  }, [ready, call, days]);

  const total = (k: keyof SourceRow) => (rows ?? []).reduce((n, r) => n + (r[k] as number), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Where visitors to the public pages came from, and how far they got. Grouped by the last campaign link each
          visitor used.
        </p>
        <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </div>
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Source / medium</th>
              <th className="px-5 py-3">Campaign / label</th>
              <th className="px-4 py-3 text-right">Visits</th>
              <th className="px-4 py-3 text-right">Pricing views</th>
              <th className="px-4 py-3 text-right">Plan clicks</th>
              <th className="px-4 py-3 text-right">Registrations</th>
              <th className="px-4 py-3 text-right">Trial</th>
              <th className="px-4 py-3 text-right">Paying</th>
              <th className="px-4 py-3 text-right">Visit → reg.</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={[r.source, r.medium, r.campaign, r.content].join('|')} className="border-t border-slate-100">
                <td className="px-5 py-3">
                  <p className="font-medium text-ink">{r.source}</p>
                  {r.medium && <p className="text-xs text-slate-400">{r.medium}</p>}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  <p>{r.campaign ?? '—'}</p>
                  {r.content && <p className="text-xs text-slate-400">{r.content}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {r.visits}
                  {r.visitors > 0 && <span className="block text-xs text-slate-400">{r.visitors} known visitors</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.pricingViews}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.planClicks}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{r.registrations}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.trials}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.paying}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{pct(r.registrations, r.visits)}</td>
              </tr>
            ))}
            {rows && rows.length > 0 && (
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-ink">
                <td className="px-5 py-3" colSpan={2}>Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{total('visits')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total('pricingViews')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total('planClicks')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total('registrations')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total('trials')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total('paying')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(total('registrations'), total('visits'))}</td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">
                  No visits recorded in this period yet.
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        &ldquo;Known visitors&rdquo; counts only people who accepted analytics. Visits from untagged links show as
        &ldquo;direct&rdquo; or the referring website. Visitor timelines and session recordings are in PostHog.
      </p>
    </div>
  );
}

interface TrackedLink {
  id: string;
  slug: string;
  destination: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  active: boolean;
  createdAt: string;
  clicks: number;
  clicks7d: number;
  visitors: number;
  registrations: number;
  lastClickAt: string | null;
}

const DESTINATIONS: [string, string][] = [
  ['/pricing', 'Pricing'],
  ['/register-organisation', 'Register organisation'],
  ['/login', 'Sign-in page'],
  ['/careers', 'Careers'],
  ['/support', 'Support'],
];
const SOURCES: [string, string, string][] = [
  ['whatsapp', 'WhatsApp', 'social'],
  ['linkedin', 'LinkedIn', 'social'],
  ['facebook', 'Facebook', 'social'],
  ['instagram', 'Instagram', 'social'],
  ['youtube', 'YouTube', 'video'],
  ['email', 'Email', 'email'],
  ['qr', 'QR code / print', 'print'],
  ['partner', 'Partner / referral', 'referral'],
];
const SHORT: Record<string, string> = { whatsapp: 'wa', linkedin: 'li', facebook: 'fb', instagram: 'ig', youtube: 'yt', email: 'em', qr: 'qr', partner: 'pt' };
const slugPart = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const EMPTY = { destination: '/pricing', source: 'whatsapp', campaign: '', content: '', slug: '' };

export function LinksTab() {
  const { ready, call } = usePlatformApi();
  const [links, setLinks] = useState<TrackedLink[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(() => {
    call<TrackedLink[]>('/platform-admin/marketing/links')
      .then(setLinks)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load links.'));
  }, [call]);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const suggested = [SHORT[form.source] ?? slugPart(form.source), slugPart(form.content) || slugPart(form.campaign)].filter(Boolean).join('-');
  const slug = slugEdited ? form.slug : suggested;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (slug.length < 3) return setError('Add a label (for example the group name) so the link gets a short name.');
    setSaving(true);
    try {
      await call('/platform-admin/marketing/links', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          destination: form.destination,
          source: form.source,
          medium: SOURCES.find((s) => s[0] === form.source)?.[2],
          campaign: form.campaign || undefined,
          content: form.content || undefined,
        }),
      });
      // Keep the source and campaign so the next group's link is two fields away.
      setForm({ ...form, content: '', slug: '' });
      setSlugEdited(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the link.');
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await call(`/platform-admin/marketing/links/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the link.');
    }
  }

  async function copy(l: TrackedLink) {
    try {
      await navigator.clipboard.writeText(`${origin}/go/${l.slug}`);
      setCopied(l.id);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked — the address is shown in full to copy by hand */ }
  }

  async function downloadQr(l: TrackedLink) {
    const url = await QRCode.toDataURL(`${origin}/go/${l.slug}`, { width: 1024, margin: 2 });
    const a = document.createElement('a');
    a.href = url;
    a.download = `tmpro-${l.slug}.png`;
    a.click();
  }

  return (
    <div>
      <form onSubmit={create} className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-ink">New short link</p>
        <p className="mt-1 text-xs text-slate-500">
          Make one link for each place you share it — each WhatsApp group, post or flyer — so its clicks are counted
          separately.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Goes to
            <select className="input mt-1" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}>
              {DESTINATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Shared on
            <select className="input mt-1" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Campaign
            <input className="input mt-1" placeholder="e.g. advert-70s" maxLength={120} value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Label (group, post or version)
            <input className="input mt-1" placeholder="e.g. HR Managers Lusaka" maxLength={160} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block grow text-xs font-semibold uppercase tracking-wide text-slate-500">
            Short link
            <div className="mt-1 flex items-center gap-1">
              <span className="text-sm normal-case tracking-normal text-slate-500">{origin}/go/</span>
              <input
                className="input"
                value={slug}
                maxLength={80}
                onChange={(e) => {
                  setSlugEdited(true);
                  setForm({ ...form, slug: slugPart(e.target.value.replace(/-$/, '')) + (e.target.value.endsWith('-') ? '-' : '') });
                }}
              />
            </div>
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create link'}
          </button>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Short link</th>
              <th className="px-5 py-3">Shared on / campaign</th>
              <th className="px-4 py-3">Goes to</th>
              <th className="px-4 py-3 text-right">Clicks</th>
              <th className="px-4 py-3 text-right">Known visitors</th>
              <th className="px-4 py-3 text-right">Registrations</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {(links ?? []).map((l) => (
              <tr key={l.id} className={`border-t border-slate-100 ${l.active ? '' : 'opacity-60'}`}>
                <td className="px-5 py-3">
                  <p className="font-medium text-ink">/go/{l.slug}</p>
                  <p className="text-xs text-slate-400">
                    {l.active ? `Created ${new Date(l.createdAt).toLocaleDateString()}` : 'Paused — clicks are not counted'}
                  </p>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  <p>{l.source}{l.content ? ` · ${l.content}` : ''}</p>
                  {l.campaign && <p className="text-xs text-slate-400">{l.campaign}</p>}
                </td>
                <td className="px-4 py-3">
                  <select className="input w-auto min-w-[10rem] !py-1 text-xs" value={l.destination} aria-label="Destination" onChange={(e) => patch(l.id, { destination: e.target.value })}>
                    {!DESTINATIONS.some(([v]) => v === l.destination) && <option value={l.destination}>{l.destination}</option>}
                    {DESTINATIONS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  <span className="font-semibold text-ink">{l.clicks}</span>
                  <span className="block text-xs text-slate-400">
                    {l.clicks7d} this week{l.lastClickAt ? ` · last ${new Date(l.lastClickAt).toLocaleDateString()}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{l.visitors}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{l.registrations}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <button type="button" className="btn-secondary !py-1" onClick={() => copy(l)}>
                    {copied === l.id ? 'Copied' : 'Copy'}
                  </button>{' '}
                  <button type="button" className="btn-secondary !py-1" onClick={() => downloadQr(l)}>QR</button>{' '}
                  <button
                    type="button"
                    className="btn-secondary !py-1"
                    onClick={() => setForm({ destination: l.destination, source: l.source, campaign: l.campaign ?? '', content: '', slug: '' })}
                  >
                    Duplicate
                  </button>{' '}
                  <button type="button" className="btn-secondary !py-1" onClick={() => patch(l.id, { active: !l.active })}>
                    {l.active ? 'Pause' : 'Resume'}
                  </button>
                </td>
              </tr>
            ))}
            {links && links.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">No short links yet.</td>
              </tr>
            )}
            {!links && !error && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Clicks exclude link previews and crawlers. A short name can&apos;t be reused once created, so a link already
        shared keeps its history; pause it instead.
      </p>
    </div>
  );
}

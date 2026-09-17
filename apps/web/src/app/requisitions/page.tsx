'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';

interface Requisition {
  id: string;
  title: string;
  department: string | null;
  headcount: number;
  budget: number | null;
  status: string;
  employmentType: string | null;
  location: string | null;
  roleSummary: string | null;
  whatYoullDo: string | null;
  whatYoullBring: string | null;
  whatYoullGet: string | null;
  whyUs: string | null;
}

const EMPLOYMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Intern' },
];

export default function RequisitionsPage() {
  const { session, ready, call } = useApi();
  const [items, setItems] = useState<Requisition[]>([]);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [headcount, setHeadcount] = useState(1);
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function refresh() {
    if (!ready) return;
    try {
      setItems(await call<Requisition[]>('/requisitions'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load requisitions.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call('/requisitions', {
        method: 'POST',
        body: JSON.stringify({ title, department, headcount, employmentType, location }),
      });
      setTitle('');
      setDepartment('');
      setHeadcount(1);
      setLocation('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create requisition.');
    }
  }

  async function approve(id: string) {
    await call(`/requisitions/${id}/approve`, { method: 'POST' });
    refresh();
  }

  if (!ready) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Recruitment</h1>
        <p className="text-sm text-slate-500">
          Headcount → hire pipeline. Once a requisition is Approved and its public listing filled in below, it shows
          up automatically on your public careers page — no separate publishing step.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Role title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Department</label>
          <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div>
          <label className="label">Headcount</label>
          <input
            type="number"
            min={1}
            className="input"
            value={headcount}
            onChange={(e) => setHeadcount(parseInt(e.target.value, 10))}
          />
        </div>
        <div>
          <label className="label">Employment type</label>
          <select className="input" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Location</label>
          <input
            className="input"
            placeholder="e.g. Auckland, NZ"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="sm:col-span-4">
          <button className="btn-primary">Raise requisition</button>
        </div>
      </form>

      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">{r.title}</p>
                <p className="text-xs text-slate-500">
                  {r.department ?? 'No department'} · headcount {r.headcount}
                  {r.location ? ` · ${r.location}` : ''}
                </p>
                {r.status === 'APPROVED' && (
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    live at: /careers/{session?.tenant.slug}/{r.id}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="badge bg-slate-100 text-slate-600">{r.status}</span>
                {(session?.user.role === 'ADMIN' || session?.user.role === 'HR') && r.status === 'PENDING_APPROVAL' && (
                  <button className="btn-primary py-1" onClick={() => approve(r.id)}>
                    Approve
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary py-1"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  {expandedId === r.id ? 'Close' : 'Public listing'}
                </button>
              </div>
            </div>
            {expandedId === r.id && <PublicListingEditor requisition={r} call={call} onSaved={refresh} />}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">No requisitions yet.</p>}
      </div>
    </div>
  );
}

/** The "Your Role / What you'll do / What you'll bring / What you'll get / Why Us"
 *  content shown on the public careers page for this requisition, once APPROVED. */
function PublicListingEditor({
  requisition,
  call,
  onSaved,
}: {
  requisition: Requisition;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
  onSaved: () => void;
}) {
  const [roleSummary, setRoleSummary] = useState(requisition.roleSummary ?? '');
  const [whatYoullDo, setWhatYoullDo] = useState(requisition.whatYoullDo ?? '');
  const [whatYoullBring, setWhatYoullBring] = useState(requisition.whatYoullBring ?? '');
  const [whatYoullGet, setWhatYoullGet] = useState(requisition.whatYoullGet ?? '');
  const [whyUs, setWhyUs] = useState(requisition.whyUs ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await call(`/requisitions/${requisition.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleSummary, whatYoullDo, whatYoullBring, whatYoullGet, whyUs }),
      });
      setSaved(true);
      onSaved();
    } catch {
      setError('Could not save this listing.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      {requisition.status !== 'APPROVED' && (
        <p className="text-xs text-amber-600">
          This won&apos;t show on the public careers page until the requisition is Approved.
        </p>
      )}
      <div>
        <label className="label">Your Role</label>
        <textarea className="input" rows={2} value={roleSummary} onChange={(e) => setRoleSummary(e.target.value)} />
      </div>
      <div>
        <label className="label">What you&apos;ll do</label>
        <textarea className="input" rows={3} value={whatYoullDo} onChange={(e) => setWhatYoullDo(e.target.value)} />
      </div>
      <div>
        <label className="label">What you&apos;ll bring</label>
        <textarea className="input" rows={3} value={whatYoullBring} onChange={(e) => setWhatYoullBring(e.target.value)} />
      </div>
      <div>
        <label className="label">What you&apos;ll get</label>
        <textarea className="input" rows={2} value={whatYoullGet} onChange={(e) => setWhatYoullGet(e.target.value)} />
      </div>
      <div>
        <label className="label">Why Us</label>
        <textarea className="input" rows={2} value={whyUs} onChange={(e) => setWhyUs(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary py-1.5" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save listing'}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiUploadMultipart } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { day, Evaluation, LeaveTypeOverview, units } from '@/lib/leave';

type Call = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * v028.A — request (or book) leave with a live preview: the API evaluates
 * the request exactly as it will on submission/approval — working days
 * after weekends and public holidays, balance before/after, pay tiers,
 * rule errors and warnings.
 */
export function LeaveRequestForm({
  types,
  call,
  employeeId,
  onDone,
  compact = false,
}: {
  types: LeaveTypeOverview[];
  call: Call;
  /** Set when HR/Admin books on someone's behalf. */
  employeeId?: string;
  onDone: () => void;
  compact?: boolean;
}) {
  const { session } = useAuth();
  const selectable = useMemo(() => types.filter((t) => t.eligible), [types]);
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startHalf, setStartHalf] = useState(false);
  const [endHalf, setEndHalf] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [multipleBirth, setMultipleBirth] = useState(false);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | undefined>();
  const [autoApprove, setAutoApprove] = useState(true);
  const [preview, setPreview] = useState<Evaluation | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!typeId && selectable.length) setTypeId(selectable[0].leaveTypeId);
  }, [selectable, typeId]);

  const type = selectable.find((t) => t.leaveTypeId === typeId);
  const isEvent = type?.kind === 'EVENT';
  const halves = type?.unitBasis !== 'CALENDAR_DAYS';
  const oneDay = type?.code === 'MOTHERS_DAY';

  // Live preview, debounced.
  useEffect(() => {
    setPreview(null);
    if (!typeId || !start || (!end && !oneDay)) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const ev = await call<Evaluation>('/leave/requests/preview', {
          method: 'POST',
          body: JSON.stringify({
            leaveTypeId: typeId,
            startDate: start,
            endDate: oneDay ? start : end,
            startHalf,
            endHalf,
            eventDate: isEvent ? eventDate || null : null,
            multipleBirth,
            employeeId,
          }),
        });
        setPreview(ev);
      } catch (err) {
        setPreview(null);
        setError(err instanceof ApiError ? err.message : 'Could not check this request.');
      } finally {
        setPreviewing(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [typeId, start, end, startHalf, endHalf, eventDate, multipleBirth, employeeId, isEvent, oneDay, call]);

  function reset() {
    setStart('');
    setEnd('');
    setStartHalf(false);
    setEndHalf(false);
    setEventDate('');
    setMultipleBirth(false);
    setReason('');
    setFile(undefined);
    if (fileRef.current) fileRef.current.value = '';
    setPreview(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setSubmitting(true);
    try {
      const fields: Record<string, string> = {
        leaveTypeId: typeId,
        startDate: start,
        endDate: oneDay ? start : end,
        startHalf: String(startHalf),
        endHalf: String(endHalf),
        multipleBirth: String(multipleBirth),
      };
      if (isEvent && eventDate) fields.eventDate = eventDate;
      if (reason.trim() && type?.reasonAllowed) fields.reason = reason.trim();
      if (employeeId) {
        fields.employeeId = employeeId;
        fields.autoApprove = String(autoApprove);
      }
      const row = await apiUploadMultipart<{ status: string }>('/leave/requests', session?.accessToken ?? null, { attachment: file }, fields);
      setDone(row.status === 'APPROVED' ? 'Booked and approved.' : 'Request sent for approval.');
      reset();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit this request.');
    } finally {
      setSubmitting(false);
    }
  }

  if (selectable.length === 0) return <p className="text-sm text-slate-500">No leave types are available.</p>;

  const needsDoc = preview?.attachmentRequired ?? false;
  const canSubmit = !!preview?.ok && !submitting && (!type?.reasonRequired || reason.trim()) && (!needsDoc || !!file || !!employeeId);

  return (
    <form onSubmit={submit} className={compact ? 'space-y-3' : 'card space-y-4'}>
      {!compact && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{employeeId ? 'Book leave' : 'Request leave'}</h2>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Type</label>
          <select
            className="input"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setError(null);
            }}
          >
            {selectable.map((t) => (
              <option key={t.leaveTypeId} value={t.leaveTypeId}>
                {t.name}
                {t.kind === 'ACCRUING' && t.available != null ? ` — ${t.available} available` : ''}
                {t.kind === 'ALLOWANCE' && t.available != null ? ` — ${t.available} left` : ''}
                {!t.isPaid ? ' (unpaid)' : ''}
              </option>
            ))}
          </select>
          {type?.description && <p className="mt-1 text-xs text-slate-400">{type.description}</p>}
        </div>
        {isEvent && (
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{type?.eventRules?.eventLabel ?? 'Event date'}</label>
              <input type="date" className="input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            </div>
            {type?.eventRules?.multipleBirthExtraDays ? (
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
                <input type="checkbox" checked={multipleBirth} onChange={(e) => setMultipleBirth(e.target.checked)} />
                Multiple birth (+{type.eventRules.multipleBirthExtraDays} days)
              </label>
            ) : null}
          </div>
        )}
        <div>
          <label className="label">{oneDay ? 'Day' : 'First day'}</label>
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} required />
          {halves && !oneDay && (
            <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={startHalf} onChange={(e) => setStartHalf(e.target.checked)} /> Half day
            </label>
          )}
        </div>
        {!oneDay && (
          <div>
            <label className="label">Last day</label>
            <input type="date" className="input" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
            {halves && (
              <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={endHalf} onChange={(e) => setEndHalf(e.target.checked)} /> Half day
              </label>
            )}
          </div>
        )}
        {type?.reasonAllowed ? (
          <div className="sm:col-span-2">
            <label className="label">Reason{type.reasonRequired ? '' : ' (optional)'}</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required={type.reasonRequired} />
          </div>
        ) : (
          <p className="sm:col-span-2 text-xs text-slate-400">No reason or certificate is needed for {type?.name}.</p>
        )}
        {(type?.attachmentRequired || needsDoc) && (
          <div className="sm:col-span-2">
            <label className="label">
              Supporting document {needsDoc ? (employeeId ? '(recommended)' : '(required)') : '(if more than ' + (type?.attachmentFromUnits ?? 0) + ' day)'}
            </label>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="input" onChange={(e) => setFile(e.target.files?.[0])} />
            <p className="mt-1 text-xs text-slate-400">PDF or photo, up to 2 MB — e.g. a medical certificate or birth record. It&apos;s filed under Documents.</p>
          </div>
        )}
        {employeeId && (
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            Approve straight away (skip the approval steps)
          </label>
        )}
      </div>

      {(preview || previewing) && (
        <div className={`rounded-xl border p-3 text-sm ${preview && !preview.ok ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
          {previewing && !preview && <p className="text-slate-500">Checking…</p>}
          {preview && (
            <div className="space-y-1.5">
              <p className="font-semibold text-ink">
                {units(preview.units, type?.unitBasis)}
                {preview.balance && preview.balance.before != null && (
                  <span className="font-normal text-slate-500">
                    {' '}
                    · {preview.balance.label}: {preview.balance.before} → {preview.balance.after}
                  </span>
                )}
              </p>
              {preview.holidaysSkipped.length > 0 && (
                <p className="text-xs text-slate-500">
                  Not counted: {preview.holidaysSkipped.map((h) => `${h.name} (${day(h.date)})`).join(', ')}
                </p>
              )}
              {(preview.payBreakdown.HALF > 0 || preview.payBreakdown.UNPAID > 0) && (
                <p className="text-xs text-slate-600">
                  Pay: {preview.payBreakdown.FULL} full · {preview.payBreakdown.HALF} half · {preview.payBreakdown.UNPAID} unpaid
                </p>
              )}
              {preview.errors.map((m) => (
                <p key={m} className="text-xs font-medium text-red-700">
                  {m}
                </p>
              ))}
              {preview.warnings.map((m) => (
                <p key={m} className="text-xs text-amber-700">
                  {m}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">{done}</p>}
      <button className="btn-primary" disabled={!canSubmit}>
        {submitting ? 'Submitting…' : employeeId ? (autoApprove ? 'Book leave' : 'Submit for approval') : preview && type?.approvalFlow.length === 0 ? 'Take this day' : 'Submit request'}
      </button>
    </form>
  );
}

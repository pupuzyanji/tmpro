'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { IconPlus, IconTrash } from '@/components/icons';
import { DayEntryForm, TIMESHEET_WORK_TYPES, Timesheet, emptyDayEntry, nextSevenDays, toDateInput } from '@/lib/timesheets-shared';

/** One day's fields — shared by the single "Add Timesheet" modal and every
 *  row of "Add Weekly Timesheet". Same visual language as
 *  ChangePasswordModal (label/input classes, rounded-2xl card). */
function DayEntryFields({
  entry,
  onChange,
  showDate,
}: {
  entry: DayEntryForm;
  onChange: (next: DayEntryForm) => void;
  showDate: boolean;
}) {
  function addBreak() {
    onChange({ ...entry, breaks: [...entry.breaks, { start: '', end: '' }] });
  }
  function updateBreak(i: number, field: 'start' | 'end', value: string) {
    onChange({ ...entry, breaks: entry.breaks.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)) });
  }
  function removeBreak(i: number) {
    onChange({ ...entry, breaks: entry.breaks.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showDate && (
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={entry.date}
            onChange={(e) => onChange({ ...entry, date: e.target.value })}
            required
          />
        </div>
      )}
      <div>
        <label className="label">Work type</label>
        <select className="input" value={entry.workType} onChange={(e) => onChange({ ...entry, workType: e.target.value })}>
          {TIMESHEET_WORK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Start time</label>
        <input
          type="time"
          className="input"
          value={entry.startTime}
          onChange={(e) => onChange({ ...entry, startTime: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label">End time</label>
        <input
          type="time"
          className="input"
          value={entry.endTime}
          onChange={(e) => onChange({ ...entry, endTime: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label">Work site</label>
        <input className="input" value={entry.workSite} onChange={(e) => onChange({ ...entry, workSite: e.target.value })} />
      </div>
      <div>
        <label className="label">Position</label>
        <input className="input" value={entry.position} onChange={(e) => onChange({ ...entry, position: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <div className="mb-1 flex items-center justify-between">
          <label className="label !mb-0">Breaks</label>
          <button type="button" className="btn-secondary flex items-center gap-1 py-1 text-xs" onClick={addBreak}>
            <IconPlus /> Add break
          </button>
        </div>
        {entry.breaks.length === 0 ? (
          <p className="text-xs text-slate-400">No breaks.</p>
        ) : (
          <div className="space-y-2">
            {entry.breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" className="input" value={b.start} onChange={(e) => updateBreak(i, 'start', e.target.value)} />
                <span className="text-xs text-slate-400">to</span>
                <input type="time" className="input" value={b.end} onChange={(e) => updateBreak(i, 'end', e.target.value)} />
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => removeBreak(i)} aria-label="Remove break">
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={entry.notes} onChange={(e) => onChange({ ...entry, notes: e.target.value })} />
      </div>
    </div>
  );
}

/** "Add Timesheet" — a single day's entry, POST /timesheets. */
export function AddTimesheetModal({
  defaultWorkSite,
  defaultPosition,
  call,
  onClose,
  onSaved,
}: {
  defaultWorkSite: string;
  defaultPosition: string;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entry, setEntry] = useState<DayEntryForm>(() =>
    emptyDayEntry(new Date().toISOString().slice(0, 10), defaultWorkSite, defaultPosition),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await call('/timesheets', {
        method: 'POST',
        body: JSON.stringify({
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          breaks: entry.breaks.filter((b) => b.start && b.end),
          workSite: entry.workSite || undefined,
          position: entry.position || undefined,
          workType: entry.workType || undefined,
          notes: entry.notes || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this timesheet entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-brand-gradient" />
        <form onSubmit={onSubmit} className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Add timesheet</h2>
            <p className="mt-0.5 text-sm text-slate-500">Log a single day's hours for approval.</p>
          </div>

          <DayEntryFields entry={entry} onChange={setEntry} showDate />

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** "Add Weekly Timesheet" — up to 7 day-rows in one go, POST /timesheets/weekly.
 *  Rows left completely blank (no start/end time) are skipped on submit
 *  rather than rejected, since a real week rarely has all 7 days worked. */
export function AddWeeklyTimesheetModal({
  defaultWorkSite,
  defaultPosition,
  call,
  onClose,
  onSaved,
}: {
  defaultWorkSite: string;
  defaultPosition: string;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState<DayEntryForm[]>(() =>
    nextSevenDays().map((date) => emptyDayEntry(date, defaultWorkSite, defaultPosition)),
  );
  const [openIndex, setOpenIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateEntry(i: number, next: DayEntryForm) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? next : e)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = entries.filter((entry) => entry.startTime && entry.endTime);
    if (filled.length === 0) {
      setError('Fill in start and end time for at least one day.');
      return;
    }
    setSaving(true);
    try {
      await call('/timesheets/weekly', {
        method: 'POST',
        body: JSON.stringify({
          entries: filled.map((entry) => ({
            date: entry.date,
            startTime: entry.startTime,
            endTime: entry.endTime,
            breaks: entry.breaks.filter((b) => b.start && b.end),
            workSite: entry.workSite || undefined,
            position: entry.position || undefined,
            workType: entry.workType || undefined,
            notes: entry.notes || undefined,
          })),
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this week\'s timesheet.');
    } finally {
      setSaving(false);
    }
  }

  const weekdayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-brand-gradient" />
        <form onSubmit={onSubmit} className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Add weekly timesheet</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Fill in the days you worked this week — leave the rest blank, they&apos;ll be skipped.
            </p>
          </div>

          <div className="space-y-2">
            {entries.map((entry, i) => {
              const filled = Boolean(entry.startTime && entry.endTime);
              const open = openIndex === i;
              return (
                <div key={entry.date} className="rounded-xl border border-slate-100">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-ink"
                    onClick={() => setOpenIndex(open ? -1 : i)}
                  >
                    <span>{weekdayLabel(entry.date)}</span>
                    <span className={`text-xs font-normal ${filled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {filled ? `${entry.startTime}–${entry.endTime}` : 'Not worked'}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 p-4">
                      <DayEntryFields entry={entry} onChange={(next) => updateEntry(i, next)} showDate={false} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Submit week'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Edit — only reachable while the entry is still PENDING (the same rule
 *  TimesheetsService.update enforces server-side), PATCH /timesheets/:id. */
export function EditTimesheetModal({
  timesheet,
  call,
  onClose,
  onSaved,
}: {
  timesheet: Timesheet;
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entry, setEntry] = useState<DayEntryForm>({
    date: toDateInput(timesheet.date),
    startTime: timesheet.startTime,
    endTime: timesheet.endTime,
    breaks: timesheet.breaks ?? [],
    workSite: timesheet.workSite ?? '',
    position: timesheet.position ?? '',
    workType: timesheet.workType ?? TIMESHEET_WORK_TYPES[0],
    notes: timesheet.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await call(`/timesheets/${timesheet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          breaks: entry.breaks.filter((b) => b.start && b.end),
          workSite: entry.workSite || undefined,
          position: entry.position || undefined,
          workType: entry.workType || undefined,
          notes: entry.notes || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-brand-gradient" />
        <form onSubmit={onSubmit} className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Edit timesheet</h2>
            <p className="mt-0.5 text-sm text-slate-500">Only pending entries can be edited.</p>
          </div>

          <DayEntryFields entry={entry} onChange={setEntry} showDate />

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

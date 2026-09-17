'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';

interface JobDetail {
  id: string;
  title: string;
  department: string | null;
  employmentType: string | null;
  location: string | null;
  publishedAt: string | null;
  roleSummary: string | null;
  whatYoullDo: string | null;
  whatYoullBring: string | null;
  whatYoullGet: string | null;
  whyUs: string | null;
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One "Your Role" / "What you'll do" / … block — skipped entirely if empty, so a
 *  role that hasn't had every section filled in doesn't show blank headings. */
function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="mb-7">
      <h2 className="mb-2 text-base font-bold text-ink">{title}</h2>
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

export default function JobDetailPage() {
  const { tenantSlug, jobId } = useParams<{ tenantSlug: string; jobId: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [applying, setApplying] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<JobDetail>(`/careers/${tenantSlug}/jobs/${jobId}`, null);
        if (!cancelled) setJob(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'This role could not be found.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (tenantSlug && jobId) load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, jobId]);

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    setApplyError(null);
    setApplyStatus('submitting');
    try {
      await apiFetch(`/requisitions/${jobId}/apply`, null, {
        method: 'POST',
        headers: { 'x-tenant-slug': String(tenantSlug) },
        body: JSON.stringify({ firstName, lastName, email, resumeUrl: resumeUrl.trim() || undefined }),
      });
      setApplyStatus('done');
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : 'Could not submit your application.');
      setApplyStatus('idle');
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (error || !job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold text-ink">{error ?? 'Role not found.'}</p>
        <Link href={`/careers/${tenantSlug}`} className="text-sm font-medium text-brand-blue underline">
          Back to all roles
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg,#f5f3fc)] pb-16">
      <div className="mx-auto max-w-2xl px-6 pt-10">
        <Link href={`/careers/${tenantSlug}`} className="text-sm font-medium text-brand-blue underline">
          ← Back to all roles
        </Link>

        <div className="card mt-4">
          <h1 className="text-2xl font-extrabold text-ink">{job.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-500">
            {job.department && (
              <span>
                <span className="font-medium text-slate-400">Department</span>
                <br />
                {job.department}
              </span>
            )}
            <span>
              <span className="font-medium text-slate-400">Employment Type</span>
              <br />
              {job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '—'}
            </span>
            <span>
              <span className="font-medium text-slate-400">Location</span>
              <br />
              {job.location ?? '—'}
            </span>
            <span>
              <span className="font-medium text-slate-400">Date Posted</span>
              <br />
              {formatDate(job.publishedAt)}
            </span>
          </div>

          <div className="mt-7 border-t border-slate-100 pt-6">
            <Section title="Your Role" body={job.roleSummary} />
            <Section title="What you'll do" body={job.whatYoullDo} />
            <Section title="What you'll bring" body={job.whatYoullBring} />
            <Section title="What you'll get" body={job.whatYoullGet} />
            <Section title="Why Us" body={job.whyUs} />
          </div>

          {applyStatus === 'done' ? (
            <div className="mt-6 rounded-xl bg-brand-gradient-soft p-5 text-center">
              <p className="text-sm font-semibold text-ink">Application received</p>
              <p className="mt-1 text-xs text-slate-500">We&apos;ll be in touch. No account or password needed on your end.</p>
            </div>
          ) : applying ? (
            <form onSubmit={submitApplication} className="mt-6 space-y-3 rounded-xl border border-slate-100 p-5">
              <p className="text-sm font-semibold text-ink">Apply for {job.title}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">First name</label>
                  <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Last name</label>
                  <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">Resume link (optional)</label>
                <input
                  className="input"
                  placeholder="LinkedIn, Drive link, portfolio…"
                  value={resumeUrl}
                  onChange={(e) => setResumeUrl(e.target.value)}
                />
              </div>
              {applyError && <p className="text-sm text-red-600">{applyError}</p>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={applyStatus === 'submitting'}>
                  {applyStatus === 'submitting' ? 'Submitting…' : 'Submit application'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setApplying(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn-primary mt-6 w-full" onClick={() => setApplying(true)}>
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

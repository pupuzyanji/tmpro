'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';

interface Organization {
  tenantSlug: string;
  name: string;
  logoUrl: string | null;
}

interface JobListing {
  id: string;
  title: string;
  department: string | null;
  employmentType: string | null;
  location: string | null;
  publishedAt: string | null;
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

export default function CareersTenantPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [orgResult, jobsResult] = await Promise.all([
          apiFetch<Organization>(`/careers/${tenantSlug}`, null),
          apiFetch<JobListing[]>(`/careers/${tenantSlug}/jobs`, null),
        ]);
        if (!cancelled) {
          setOrg(orgResult);
          setJobs(jobsResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load this careers page.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (tenantSlug) load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    return jobs.filter((j) => {
      const matchesKeyword = !kw || j.title.toLowerCase().includes(kw) || (j.department ?? '').toLowerCase().includes(kw);
      const matchesLocation = !loc || (j.location ?? '').toLowerCase().includes(loc);
      return matchesKeyword && matchesLocation;
    });
  }, [jobs, keyword, location]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (error || !org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold text-ink">{error ?? 'Careers page not found.'}</p>
        <Link href="/login" className="text-sm font-medium text-brand-blue underline">
          Back to tmPro
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg,#f5f3fc)]">
      {/* Header */}
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-card sm:px-10">
        <div className="flex items-center gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-sm font-bold text-white">
              {org.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="text-base font-bold text-ink">{org.name}</span>
        </div>
        <a
          href="https://claude.ai"
          onClick={(e) => e.preventDefault()}
          className="hidden cursor-default items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 sm:flex"
        >
          Powered by tm<span className="font-light">|</span>Pro
        </a>
      </header>

      {/* Hero */}
      <div
        className="mx-4 mt-4 overflow-hidden rounded-2xl px-8 py-14 text-center text-white sm:mx-10 sm:px-16"
        style={{ background: 'var(--brand-gradient)' }}
      >
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Careers at {org.name}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-white/85 sm:text-base">
          We&apos;re hiring — take a look at the open roles below and find where you fit.
        </p>
      </div>

      {/* Search */}
      <div className="mx-4 mt-6 rounded-2xl bg-slate-100 p-6 sm:mx-10">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label">Search by keyword</label>
            <input
              className="input bg-white"
              placeholder="Role, department…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Search by location</label>
            <input
              className="input bg-white"
              placeholder="City, country…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary h-fit sm:mb-0">
            Search Jobs
          </button>
        </div>
      </div>

      {/* Job list */}
      <div className="mx-4 my-8 sm:mx-10">
        <p className="mb-3 text-sm text-slate-500">
          Showing {filtered.length} of {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
        </p>
        <div className="space-y-3">
          {filtered.map((job) => (
            <Link
              key={job.id}
              href={`/careers/${tenantSlug}/${job.id}`}
              className="card block transition-shadow hover:shadow-lg"
            >
              <p className="text-base font-semibold text-brand-blue">{job.title}</p>
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-500">
                <span>
                  <span className="font-medium text-slate-400">Date</span>
                  <br />
                  {formatDate(job.publishedAt)}
                </span>
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
                {job.department && (
                  <span>
                    <span className="font-medium text-slate-400">Department</span>
                    <br />
                    {job.department}
                  </span>
                )}
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="card text-center text-sm text-slate-500">No open roles match your search right now.</p>
          )}
        </div>
      </div>
    </div>
  );
}

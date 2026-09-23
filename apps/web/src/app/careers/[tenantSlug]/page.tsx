'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { EMPLOYMENT_TYPE_LABELS, formatJobDate, type JobListing } from '@/lib/careers-shared';
import { IconMapPin, IconBuilding, IconClock } from '@/components/icons';

interface Organization {
  tenantSlug: string;
  name: string;
  logoUrl: string | null;
}

/** One tenant's public job board. Midnight-themed via `data-theme="midnight"`
 *  on the page root (see AllTenantsCareersPage for why that's enough on its
 *  own — the existing CSS-variable tokens do the rest). */
export default function CareersTenantPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [location, setLocation] = useState('');
  const [department, setDepartment] = useState('');

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

  const employmentTypes = useMemo(() => Array.from(new Set(jobs.map((j) => j.employmentType).filter(Boolean))) as string[], [jobs]);
  const locations = useMemo(() => Array.from(new Set(jobs.map((j) => j.location).filter(Boolean))) as string[], [jobs]);
  const departments = useMemo(() => Array.from(new Set(jobs.map((j) => j.department).filter(Boolean))) as string[], [jobs]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return jobs.filter((j) => {
      const matchesKeyword = !kw || j.title.toLowerCase().includes(kw) || (j.department ?? '').toLowerCase().includes(kw);
      const matchesType = !employmentType || j.employmentType === employmentType;
      const matchesLocation = !location || j.location === location;
      const matchesDepartment = !department || j.department === department;
      return matchesKeyword && matchesType && matchesLocation && matchesDepartment;
    });
  }, [jobs, keyword, employmentType, location, department]);

  if (loading) {
    return (
      <div data-theme="midnight" className="flex min-h-screen items-center justify-center text-sm text-slate-400" style={{ background: 'var(--page-bg)' }}>
        Loading…
      </div>
    );
  }

  if (error || !org) {
    return (
      <div data-theme="midnight" className="flex min-h-screen flex-col items-center justify-center gap-2 text-center" style={{ background: 'var(--page-bg)' }}>
        <p className="text-lg font-semibold text-ink">{error ?? 'Careers page not found.'}</p>
        <Link href="/careers" className="text-sm font-medium text-brand-blue underline">
          Browse all open roles
        </Link>
      </div>
    );
  }

  return (
    <div data-theme="midnight" className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: 'var(--brand-gradient)' }}>
              {org.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="text-base font-bold text-ink">{org.name}</span>
        </div>
        <Link
          href="/careers"
          className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 sm:flex"
        >
          Powered by tm<span className="font-light">|</span>Pro
        </Link>
      </header>

      {/* Hero */}
      <div className="mx-4 mt-4 overflow-hidden rounded-2xl px-8 py-14 text-center text-white sm:mx-10 sm:px-16" style={{ background: 'var(--sidebar-gradient)' }}>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Careers at {org.name}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-white/70 sm:text-base">
          We&apos;re hiring — take a look at the open roles below and find where you fit.
        </p>
      </div>

      {/* Search */}
      <div className="mx-4 mt-6 rounded-2xl bg-white p-6 shadow-card sm:mx-10">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Keyword</label>
            <input className="input" placeholder="Role, department…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <div>
            <label className="label">Employment type</label>
            <select className="input" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="">Any</option>
              {employmentTypes.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Location</label>
            <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">Any</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Any</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Job list */}
      <div className="mx-4 my-8 sm:mx-10">
        <p className="mb-3 text-sm text-slate-400">
          Showing {filtered.length} of {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
        </p>
        <div className="space-y-3">
          {filtered.map((job) => (
            <Link key={job.id} href={`/careers/${tenantSlug}/${job.id}`} className="card block transition-shadow hover:shadow-lg">
              <p className="text-base font-semibold text-brand-blue">{job.title}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <IconClock />
                  {job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '—'}
                </span>
                <span className="flex items-center gap-1">
                  <IconMapPin />
                  {job.location ?? '—'}
                </span>
                {job.department && (
                  <span className="flex items-center gap-1">
                    <IconBuilding />
                    {job.department}
                  </span>
                )}
                <span className="text-slate-400">Posted {formatJobDate(job.publishedAt)}</span>
              </div>
              {job.requiredSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {job.requiredSkills.slice(0, 6).map((s) => (
                    <span key={s} className="badge bg-slate-100 text-slate-500">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
          {filtered.length === 0 && <p className="card text-center text-sm text-slate-500">No open roles match your search right now.</p>}
        </div>
      </div>
    </div>
  );
}

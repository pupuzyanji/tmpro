'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { EMPLOYMENT_TYPE_LABELS, formatJobDate, type AllTenantsJobListing } from '@/lib/careers-shared';
import { IconBriefcase, IconMapPin, IconBuilding, IconClock } from '@/components/icons';

/**
 * Bare /careers — every ACTIVE tenant's open roles pooled together, "tmPro
 * Careers" rather than any one organization's board. Entering a specific
 * organization's slug (/careers/[tenantSlug]) narrows to just that tenant's
 * roles (see CareersTenantPage). Midnight-themed via `data-theme="midnight"`
 * on the page root — the same CSS-variable tokens (`--page-bg`,
 * `--brand-gradient`, `--sidebar-gradient`, `.card`, `.btn-primary`, …) the
 * authenticated app uses, so this stays visually consistent with tmPro's
 * dashboard rather than inventing its own palette.
 */
export default function AllTenantsCareersPage() {
  const [jobs, setJobs] = useState<AllTenantsJobListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [location, setLocation] = useState('');
  const [department, setDepartment] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<AllTenantsJobListing[]>('/careers/jobs', null)
      .then((rows) => {
        if (!cancelled) setJobs(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load open roles.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const employmentTypes = useMemo(() => Array.from(new Set(jobs.map((j) => j.employmentType).filter(Boolean))) as string[], [jobs]);
  const locations = useMemo(() => Array.from(new Set(jobs.map((j) => j.location).filter(Boolean))) as string[], [jobs]);
  const departments = useMemo(() => Array.from(new Set(jobs.map((j) => j.department).filter(Boolean))) as string[], [jobs]);
  const companyCount = useMemo(() => new Set(jobs.map((j) => j.tenantSlug)).size, [jobs]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return jobs.filter((j) => {
      const matchesKeyword =
        !kw ||
        j.title.toLowerCase().includes(kw) ||
        (j.department ?? '').toLowerCase().includes(kw) ||
        j.tenantName.toLowerCase().includes(kw);
      const matchesType = !employmentType || j.employmentType === employmentType;
      const matchesLocation = !location || j.location === location;
      const matchesDepartment = !department || j.department === department;
      return matchesKeyword && matchesType && matchesLocation && matchesDepartment;
    });
  }, [jobs, keyword, employmentType, location, department]);

  return (
    <div data-theme="midnight" className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="flex items-center gap-2 text-base font-bold text-ink">
          tm<span className="font-light text-slate-400">|</span>Pro
          <span className="text-sm font-medium text-slate-400">Careers</span>
        </span>
        <Link href="/login" className="text-sm font-medium text-brand-blue hover:underline">
          Employer sign in
        </Link>
      </header>

      <div className="mx-4 overflow-hidden rounded-2xl px-8 py-16 text-center text-white sm:mx-10 sm:px-16" style={{ background: 'var(--sidebar-gradient)' }}>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <IconBriefcase />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Find your next role</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-white/70 sm:text-base">
          Open roles across every organization on tmPro
          {companyCount > 0 ? ` — ${companyCount} ${companyCount === 1 ? 'company' : 'companies'} hiring right now.` : '.'}
        </p>
        <p className="mx-auto mt-2 max-w-lg text-xs text-white/50">
          Looking for one company specifically? Try tmpro.app/careers/&lt;their-name&gt;
        </p>
      </div>

      <div className="mx-4 mt-6 rounded-2xl bg-white p-5 shadow-card sm:mx-10">
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            className="input"
            placeholder="Search role, company, department…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className="input" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
            <option value="">Any employment type</option>
            {employmentTypes.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
          <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Any location</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Any department</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mx-4 my-8 sm:mx-10">
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="text-sm text-white/50">Loading open roles…</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-400">
              Showing {filtered.length} of {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
            </p>
            <div className="space-y-3">
              {filtered.map((job) => (
                <Link
                  key={`${job.tenantSlug}/${job.id}`}
                  href={`/careers/${job.tenantSlug}/${job.id}`}
                  className="card flex flex-wrap items-center gap-4 transition-shadow hover:shadow-lg"
                >
                  {job.tenantLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.tenantLogoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-contain" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'var(--brand-gradient)' }}>
                      {job.tenantName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-brand-blue">{job.title}</p>
                    <p className="truncate text-xs font-medium text-slate-500">{job.tenantName}</p>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
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
                        {job.requiredSkills.slice(0, 5).map((s) => (
                          <span key={s} className="badge bg-slate-100 text-slate-500">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && (
                <p className="card text-center text-sm text-slate-500">No open roles match your search right now.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

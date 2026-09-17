'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { Logo } from '@/components/logo';
import { COUNTRIES } from '@/lib/reference-data';
import {
  IconUsers,
  IconCalendar,
  IconTarget,
  IconDollar,
  IconBriefcase,
  IconGraduationCap,
  IconDocument,
  IconChartBar,
} from '@/components/icons';

const FEATURES: Array<{ key: string; label: string; icon: React.ReactNode }> = [
  { key: 'Employee Records', label: 'Employee Records', icon: <IconUsers /> },
  { key: 'Leave & Attendance', label: 'Leave & Attendance', icon: <IconCalendar /> },
  { key: 'Performance Management', label: 'Performance Management', icon: <IconTarget /> },
  { key: 'Payroll', label: 'Payroll', icon: <IconDollar /> },
  { key: 'Recruitment', label: 'Recruitment', icon: <IconBriefcase /> },
  { key: 'Training & LMS', label: 'Training & LMS', icon: <IconGraduationCap /> },
  { key: 'Policies & Documents', label: 'Policies & Documents', icon: <IconDocument /> },
  { key: 'Reports & Analytics', label: 'Reports & Analytics', icon: <IconChartBar /> },
];

const STAFF_HELP = "How many people will use tmPro — your whole headcount, not just admins.";

export default function RegisterOrganisationPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organisationName, setOrganisationName] = useState('');
  const [country, setCountry] = useState('');
  const [staffComplement, setStaffComplement] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  function toggleFeature(key: string) {
    setFeatures((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const staff = parseInt(staffComplement, 10);
    if (!staff || staff < 1) {
      setError('Enter how many staff will be using tmPro.');
      return;
    }
    setStatus('submitting');
    try {
      await apiFetch('/org-signup', null, {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          organisationName,
          country,
          staffComplement: staff,
          featuresNeeded: features,
        }),
      });
      setStatus('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Marketing panel — same treatment as the login hero, hidden below lg */}
      <div
        className="relative hidden shrink-0 flex-col justify-between overflow-hidden px-12 py-12 text-white lg:flex lg:w-[42%] xl:px-16"
        style={{
          background: [
            'radial-gradient(560px 420px at 0% 0%, rgba(20,184,240,0.55), transparent 60%)',
            'radial-gradient(620px 480px at 100% 100%, rgba(255,138,30,0.4), transparent 60%)',
            'radial-gradient(500px 400px at 100% 0%, rgba(214,38,201,0.35), transparent 60%)',
            'linear-gradient(160deg, #14122b 0%, #0d0b1a 100%)',
          ].join(', '),
        }}
      >
        <div>
          <div className="mb-10 flex items-center gap-2.5">
            <Logo />
          </div>
          <h1 className="max-w-sm text-[28px] font-extrabold leading-[1.2] tracking-tight">
            One system for People Ops, wherever your team works.
          </h1>
          <p className="mt-3.5 max-w-sm text-sm leading-relaxed text-white/85">
            Tell us a little about your organization and which parts of tmPro you need. We&apos;ll set up your
            workspace and be in touch.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {FEATURES.map((f) => (
            <div key={f.key} className="flex items-center gap-2.5">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15">
                {f.icon}
              </span>
              <span className="text-xs font-medium text-white/90">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center bg-white px-6 py-10">
        <div className="w-full max-w-lg">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo className="[&_span]:text-ink" />
          </div>

          {status === 'done' ? (
            <div className="card flex flex-col items-center py-12 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient-soft text-2xl">
                ✓
              </span>
              <h1 className="text-xl font-semibold text-ink">Thanks — we&apos;ve got it</h1>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                Someone from tmPro will reach out to {email || 'you'} shortly to set up {organisationName || 'your'}
                &apos;s workspace.
              </p>
              <Link href="/login" className="btn-primary mt-6">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-ink">Register your organisation</h1>
              <p className="mt-1 text-sm text-slate-500">
                A few details, and we&apos;ll take it from there — no credit card, no commitment.
              </p>

              <form onSubmit={onSubmit} className="card mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="name">
                      Your name
                    </label>
                    <input
                      id="name"
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="email">
                      Work email
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="org">
                    Organisation name
                  </label>
                  <input
                    id="org"
                    className="input"
                    value={organisationName}
                    onChange={(e) => setOrganisationName(e.target.value)}
                    placeholder="Acme Group"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="country">
                      Country
                    </label>
                    <select
                      id="country"
                      className="input"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select a country
                      </option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="staff">
                      Staff complement
                    </label>
                    <input
                      id="staff"
                      type="number"
                      min={1}
                      className="input"
                      value={staffComplement}
                      onChange={(e) => setStaffComplement(e.target.value)}
                      placeholder="e.g. 45"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-400">{STAFF_HELP}</p>
                  </div>
                </div>

                <div>
                  <label className="label">Which features do you need?</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                    {FEATURES.map((f) => {
                      const checked = features.includes(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => toggleFeature(f.key)}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                            checked
                              ? 'border-transparent bg-brand-gradient-soft text-ink ring-1 ring-inset ring-[var(--accent-ring)]'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
                              checked ? 'border-transparent bg-brand-gradient text-white' : 'border-slate-300 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span className="flex items-center gap-1.5 font-medium">
                            {f.icon}
                            {f.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button type="submit" className="btn-primary w-full" disabled={status === 'submitting'}>
                  {status === 'submitting' ? 'Submitting…' : 'Submit registration'}
                </button>

                <p className="text-center text-xs text-slate-400">
                  Already have an account?{' '}
                  <Link href="/login" className="font-medium text-brand-blue underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

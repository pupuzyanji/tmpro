'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch, apiUploadMultipart, ApiError } from '@/lib/api';
import { EMPLOYMENT_TYPE_LABELS, formatJobDate } from '@/lib/careers-shared';
import { TagInput } from '@/components/tag-input';
import { IconMapPin, IconBuilding, IconClock, IconPlus, IconTrash, IconUpload } from '@/components/icons';

interface JobDetail {
  id: string;
  title: string;
  department: string | null;
  employmentType: string | null;
  location: string | null;
  requiredSkills: string[];
  publishedAt: string | null;
  roleSummary: string | null;
  whatYoullDo: string | null;
  whatYoullBring: string | null;
  whatYoullGet: string | null;
  whyUs: string | null;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const UPLOAD_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

const RIGHT_TO_WORK_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'YES', label: 'Yes, I am authorized to work here' },
  { value: 'NO', label: 'No' },
  { value: 'NEEDS_SPONSORSHIP', label: 'I will need visa sponsorship' },
];
const HOW_HEARD_OPTIONS = ['', 'Job Board', 'Referral', 'Company Website', 'Social Media', 'Recruiter', 'Other'];

interface EducationRow {
  key: number;
  school: string;
  degree: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
}
interface ExperienceRow {
  key: number;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

let rowKeySeq = 0;
function newEducationRow(): EducationRow {
  return { key: rowKeySeq++, school: '', degree: '', fieldOfStudy: '', startYear: '', endYear: '' };
}
function newExperienceRow(): ExperienceRow {
  return { key: rowKeySeq++, company: '', title: '', startDate: '', endDate: '', description: '' };
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

/** A single-file picker capped at 2MB, used for both the CV and the cover
 *  letter upload. Manages its own "file too large" message locally (shown
 *  the moment an oversized file is picked, regardless of whether a valid
 *  file was already chosen) — `requiredError`, from the parent, is only for
 *  "you didn't pick a file at all" on submit (the cover letter, being
 *  optional, never sets one). */
function FileDropField({
  label,
  required,
  file,
  onChange,
  requiredError,
}: {
  label: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
  requiredError?: string | null;
}) {
  const [sizeError, setSizeError] = useState<string | null>(null);

  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-red-500">*</span>}
        <span className="ml-1 normal-case text-slate-400">(PDF or image, 2MB max)</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-brand-blue hover:text-brand-blue">
        <IconUpload />
        {file ? file.name : `Choose a file…`}
        <input
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && f.size > MAX_UPLOAD_BYTES) {
              setSizeError('That file is larger than 2MB — choose a smaller one.');
              e.target.value = '';
              return;
            }
            setSizeError(null);
            onChange(f);
          }}
        />
      </label>
      {(sizeError || requiredError) && <p className="mt-1 text-xs text-red-600">{sizeError ?? requiredError}</p>}
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
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [rightToWork, setRightToWork] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [howHeard, setHowHeard] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [education, setEducation] = useState<EducationRow[]>([newEducationRow()]);
  const [experience, setExperience] = useState<ExperienceRow[]>([newExperienceRow()]);
  const [cv, setCv] = useState<File | null>(null);
  const [cvRequiredError, setCvRequiredError] = useState<string | null>(null);
  const [coverLetter, setCoverLetter] = useState<File | null>(null);
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
    if (!cv) {
      setCvRequiredError('A CV is required.');
      return;
    }
    setCvRequiredError(null);
    setApplyError(null);
    setApplyStatus('submitting');
    try {
      const educationPayload = education
        .filter((r) => r.school || r.degree || r.fieldOfStudy)
        .map(({ key: _key, ...rest }) => rest);
      const experiencePayload = experience
        .filter((r) => r.company || r.title || r.description)
        .map(({ key: _key, ...rest }) => rest);

      await apiUploadMultipart(
        `/requisitions/${jobId}/apply`,
        null,
        { cv, coverLetter: coverLetter ?? undefined },
        {
          firstName,
          lastName,
          email,
          ...(phone ? { phone } : {}),
          ...(linkedinUrl ? { linkedinUrl } : {}),
          ...(rightToWork ? { rightToWork } : {}),
          ...(expectedSalary ? { expectedSalary } : {}),
          ...(noticePeriod ? { noticePeriod } : {}),
          ...(howHeard ? { howHeard } : {}),
          skills: JSON.stringify(skills),
          education: JSON.stringify(educationPayload),
          workExperience: JSON.stringify(experiencePayload),
        },
        { headers: { 'x-tenant-slug': String(tenantSlug) } },
      );
      setApplyStatus('done');
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : 'Could not submit your application.');
      setApplyStatus('idle');
    }
  }

  if (loading) {
    return (
      <div data-theme="midnight" className="flex min-h-screen items-center justify-center text-sm text-slate-400" style={{ background: 'var(--page-bg)' }}>
        Loading…
      </div>
    );
  }

  if (error || !job) {
    return (
      <div data-theme="midnight" className="flex min-h-screen flex-col items-center justify-center gap-3 text-center" style={{ background: 'var(--page-bg)' }}>
        <p className="text-lg font-semibold text-ink">{error ?? 'Role not found.'}</p>
        <Link href={`/careers/${tenantSlug}`} className="text-sm font-medium text-brand-blue underline">
          ← Back to all roles
        </Link>
      </div>
    );
  }

  return (
    <div data-theme="midnight" className="min-h-screen pb-16" style={{ background: 'var(--page-bg)' }}>
      <div className="mx-auto max-w-2xl px-6 pt-10">
        <Link href={`/careers/${tenantSlug}`} className="text-sm font-medium text-brand-blue underline">
          ← Back to all roles
        </Link>

        <div className="card mt-4">
          <h1 className="text-2xl font-extrabold text-ink">{job.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            {job.department && (
              <span className="flex items-center gap-1">
                <IconBuilding />
                {job.department}
              </span>
            )}
            <span className="flex items-center gap-1">
              <IconClock />
              {job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '—'}
            </span>
            <span className="flex items-center gap-1">
              <IconMapPin />
              {job.location ?? '—'}
            </span>
            <span className="text-slate-400">Posted {formatJobDate(job.publishedAt)}</span>
          </div>

          {job.requiredSkills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.requiredSkills.map((s) => (
                <span key={s} className="badge bg-slate-100 text-slate-600">
                  {s}
                </span>
              ))}
            </div>
          )}

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
            <form onSubmit={submitApplication} className="mt-6 space-y-6 rounded-xl border border-slate-100 p-5">
              <p className="text-sm font-semibold text-ink">Apply for {job.title}</p>

              {/* --- Personal details ------------------------------------------------ */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your details</h3>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Email</label>
                    <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">LinkedIn / portfolio link</label>
                  <input className="input" placeholder="https://…" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
                </div>
              </div>

              {/* --- Application questions -------------------------------------------- */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Application questions</h3>
                <div>
                  <label className="label">Are you legally authorized to work in this location?</label>
                  <select className="input" value={rightToWork} onChange={(e) => setRightToWork(e.target.value)}>
                    {RIGHT_TO_WORK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Expected salary</label>
                    <input className="input" placeholder="e.g. NZD 90,000" value={expectedSalary} onChange={(e) => setExpectedSalary(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Notice period / earliest start date</label>
                    <input className="input" placeholder="e.g. 4 weeks" value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">How did you hear about this role?</label>
                  <select className="input" value={howHeard} onChange={(e) => setHowHeard(e.target.value)}>
                    {HOW_HEARD_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o || 'Select…'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* --- Education ---------------------------------------------------- */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Education</h3>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                    onClick={() => setEducation((rows) => [...rows, newEducationRow()])}
                  >
                    <IconPlus /> Add more
                  </button>
                </div>
                {education.map((row, idx) => (
                  <div key={row.key} className="rounded-xl border border-slate-100 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="input"
                        placeholder="School / institution"
                        value={row.school}
                        onChange={(e) => setEducation((rows) => rows.map((r) => (r.key === row.key ? { ...r, school: e.target.value } : r)))}
                      />
                      <input
                        className="input"
                        placeholder="Degree"
                        value={row.degree}
                        onChange={(e) => setEducation((rows) => rows.map((r) => (r.key === row.key ? { ...r, degree: e.target.value } : r)))}
                      />
                      <input
                        className="input"
                        placeholder="Field of study"
                        value={row.fieldOfStudy}
                        onChange={(e) => setEducation((rows) => rows.map((r) => (r.key === row.key ? { ...r, fieldOfStudy: e.target.value } : r)))}
                      />
                      <div className="flex gap-2">
                        <input
                          className="input"
                          placeholder="Start year"
                          value={row.startYear}
                          onChange={(e) => setEducation((rows) => rows.map((r) => (r.key === row.key ? { ...r, startYear: e.target.value } : r)))}
                        />
                        <input
                          className="input"
                          placeholder="End year"
                          value={row.endYear}
                          onChange={(e) => setEducation((rows) => rows.map((r) => (r.key === row.key ? { ...r, endYear: e.target.value } : r)))}
                        />
                      </div>
                    </div>
                    {education.length > 1 && (
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
                        onClick={() => setEducation((rows) => rows.filter((r) => r.key !== row.key))}
                      >
                        <IconTrash /> Remove entry {idx + 1}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* --- Work experience ------------------------------------------------ */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Work experience</h3>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                    onClick={() => setExperience((rows) => [...rows, newExperienceRow()])}
                  >
                    <IconPlus /> Add more
                  </button>
                </div>
                {experience.map((row, idx) => (
                  <div key={row.key} className="rounded-xl border border-slate-100 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="input"
                        placeholder="Company"
                        value={row.company}
                        onChange={(e) => setExperience((rows) => rows.map((r) => (r.key === row.key ? { ...r, company: e.target.value } : r)))}
                      />
                      <input
                        className="input"
                        placeholder="Job title"
                        value={row.title}
                        onChange={(e) => setExperience((rows) => rows.map((r) => (r.key === row.key ? { ...r, title: e.target.value } : r)))}
                      />
                      <input
                        className="input"
                        placeholder="Start date"
                        value={row.startDate}
                        onChange={(e) => setExperience((rows) => rows.map((r) => (r.key === row.key ? { ...r, startDate: e.target.value } : r)))}
                      />
                      <input
                        className="input"
                        placeholder="End date (or Present)"
                        value={row.endDate}
                        onChange={(e) => setExperience((rows) => rows.map((r) => (r.key === row.key ? { ...r, endDate: e.target.value } : r)))}
                      />
                    </div>
                    <textarea
                      className="input mt-2"
                      rows={2}
                      placeholder="What did you do in this role?"
                      value={row.description}
                      onChange={(e) => setExperience((rows) => rows.map((r) => (r.key === row.key ? { ...r, description: e.target.value } : r)))}
                    />
                    {experience.length > 1 && (
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
                        onClick={() => setExperience((rows) => rows.filter((r) => r.key !== row.key))}
                      >
                        <IconTrash /> Remove entry {idx + 1}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* --- Skills ---------------------------------------------------------- */}
              <div className="space-y-2 border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Skills</h3>
                <TagInput value={skills} onChange={setSkills} placeholder="Type a skill and press Enter…" />
              </div>

              {/* --- Documents -------------------------------------------------------- */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Documents</h3>
                <FileDropField label="CV / Résumé" required file={cv} onChange={setCv} requiredError={cvRequiredError} />
                <FileDropField label="Cover letter" file={coverLetter} onChange={setCoverLetter} />
              </div>

              {applyError && <p className="text-sm text-red-600">{applyError}</p>}
              <div className="flex gap-2 border-t border-slate-100 pt-5">
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

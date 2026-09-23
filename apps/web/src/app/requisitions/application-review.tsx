'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { DocumentViewerModal, type DocumentFull } from '@/components/document-viewer-modal';
import { IconChevronDown, IconDocument, IconUsers } from '@/components/icons';

interface EducationEntry {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  startYear?: string;
  endYear?: string;
}
interface WorkExperienceEntry {
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  expectedSalary: string | null;
  noticePeriod: string | null;
  rightToWork: string | null;
  howHeard: string | null;
  education: EducationEntry[];
  workExperience: WorkExperienceEntry[];
  skills: string[];
  stage: string;
  createdAt: string;
  hasResume: boolean;
  hasCoverLetter: boolean;
  atsScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
}

interface RequisitionSummary {
  id: string;
  title: string;
  department: string | null;
  headcount: number;
  status: string;
  requiredSkills?: string[];
}

const RIGHT_TO_WORK_LABELS: Record<string, string> = {
  YES: 'Authorized to work',
  NO: 'Not authorized',
  NEEDS_SPONSORSHIP: 'Needs sponsorship',
};

function scoreBadgeClass(score: number | null): string {
  if (score === null) return 'bg-slate-100 text-slate-500';
  if (score >= 70) return 'bg-emerald-50 text-emerald-700';
  if (score >= 40) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

/** Recruitment → Application Review: one row per requisition (role), each
 *  expandable into its AI-ATS-ranked applicant list (highest match first —
 *  the API already sorts this way). "View CV"/"View Cover Letter" fetch and
 *  open the candidate's actual uploaded document in-platform via the same
 *  DocumentViewerModal the People profile's Documents tab uses — nothing
 *  ever leaves the app as a raw download link. ADMIN/HR only; the page
 *  wrapping this only renders it for those roles (see requisitions/page.tsx). */
export function ApplicationReview({
  requisitions,
  call,
}: {
  requisitions: RequisitionSummary[];
  call: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [candidatesByReq, setCandidatesByReq] = useState<Record<string, Candidate[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentFull | null>(null);
  const [loadingDocKey, setLoadingDocKey] = useState<string | null>(null);

  async function toggle(reqId: string) {
    if (openId === reqId) {
      setOpenId(null);
      return;
    }
    setOpenId(reqId);
    if (candidatesByReq[reqId]) return;
    setLoadingId(reqId);
    setError(null);
    try {
      const rows = await call<Candidate[]>(`/requisitions/${reqId}/candidates`);
      setCandidatesByReq((prev) => ({ ...prev, [reqId]: rows }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load applicants.');
    } finally {
      setLoadingId(null);
    }
  }

  async function viewDocument(reqId: string, candidateId: string, kind: 'resume' | 'coverLetter') {
    const key = `${candidateId}:${kind}`;
    setLoadingDocKey(key);
    setError(null);
    try {
      const doc = await call<DocumentFull>(`/requisitions/${reqId}/candidates/${candidateId}/document?kind=${kind}`);
      setViewing(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    } finally {
      setLoadingDocKey(null);
    }
  }

  const rolesWithApplicants = requisitions.filter((r) => r.status === 'APPROVED' || r.status === 'PENDING_APPROVAL');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Application Review</h2>
        <p className="text-sm text-slate-500">
          Candidates ranked by AI ATS — how well their skills, CV, cover letter and application answers match the
          role&apos;s required skills. Set Required Skills on a role (below, in Requisitions) to score its applicants.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {rolesWithApplicants.map((r) => {
          const isOpen = openId === r.id;
          const candidates = candidatesByReq[r.id];
          return (
            <div key={r.id} className="card !p-0 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                onClick={() => toggle(r.id)}
              >
                <div>
                  <p className="text-sm font-medium text-ink">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    {r.department ?? 'No department'} · headcount {r.headcount}
                    {candidates && ` · ${candidates.length} applicant${candidates.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <span className="btn-secondary flex shrink-0 items-center gap-1.5 py-1.5 text-xs">
                  <IconUsers />
                  View Applicants
                  <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    <IconChevronDown />
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-5 py-4">
                  {loadingId === r.id ? (
                    <p className="text-sm text-slate-400">Loading applicants…</p>
                  ) : !candidates || candidates.length === 0 ? (
                    <p className="text-sm text-slate-400">No applicants yet for this role.</p>
                  ) : (
                    <ul className="space-y-3">
                      {candidates.map((c, idx) => (
                        <li key={c.id} className="rounded-xl border border-slate-100 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                                {idx + 1}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-ink">
                                  {c.firstName} {c.lastName}
                                </p>
                                <p className="text-xs text-slate-500">{c.email}</p>
                                {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`badge ${scoreBadgeClass(c.atsScore)}`}>
                                {c.atsScore === null ? 'AI ATS: Not scored' : `AI ATS: ${c.atsScore}%`}
                              </span>
                              <span className="badge bg-slate-100 text-slate-600">{c.stage.replace('_', ' ')}</span>
                            </div>
                          </div>

                          {(c.matchedSkills.length > 0 || c.missingSkills.length > 0) && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {c.matchedSkills.map((s) => (
                                <span key={`m-${s}`} className="badge bg-emerald-50 text-emerald-700">
                                  ✓ {s}
                                </span>
                              ))}
                              {c.missingSkills.map((s) => (
                                <span key={`x-${s}`} className="badge bg-slate-100 text-slate-400 line-through">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                            {c.rightToWork && <span>{RIGHT_TO_WORK_LABELS[c.rightToWork] ?? c.rightToWork}</span>}
                            {c.expectedSalary && <span>Expects {c.expectedSalary}</span>}
                            {c.noticePeriod && <span>Notice: {c.noticePeriod}</span>}
                            {c.howHeard && <span>Via {c.howHeard}</span>}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-50 pt-3">
                            {c.hasResume && (
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline"
                                onClick={() => viewDocument(r.id, c.id, 'resume')}
                              >
                                <IconDocument />
                                {loadingDocKey === `${c.id}:resume` ? 'Opening…' : 'View CV'}
                              </button>
                            )}
                            {c.hasCoverLetter && (
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline"
                                onClick={() => viewDocument(r.id, c.id, 'coverLetter')}
                              >
                                <IconDocument />
                                {loadingDocKey === `${c.id}:coverLetter` ? 'Opening…' : 'View Cover Letter'}
                              </button>
                            )}
                            {c.skills.length > 0 && (
                              <span className="text-xs text-slate-400">Skills: {c.skills.join(', ')}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {rolesWithApplicants.length === 0 && <p className="text-sm text-slate-500">No requisitions to review yet.</p>}
      </div>

      {viewing && <DocumentViewerModal doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

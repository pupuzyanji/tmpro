'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { IconMaximize, IconMinimize, IconPlay } from '@/components/icons';

interface QuizOptionAuthored {
  optionText: string;
  isCorrect: boolean;
}
interface QuizQuestionAuthored {
  id: string;
  question: string;
  options: QuizOptionAuthored[];
}
interface QuizQuestionToTake {
  id: string;
  question: string;
  options: Array<{ id: string; optionText: string }>;
}
interface CourseSummary {
  id: string;
  title: string;
  imageUrl: string | null;
  courseUrl: string;
  published: boolean;
  quizQuestions?: QuizQuestionAuthored[];
}
interface Assignment {
  id: string;
  status: 'PENDING' | 'STARTED' | 'COMPLETED';
  scorePercent: number | null;
  assignedAt: string;
  course: CourseSummary;
}
interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  photoUrl: string | null;
}

/** Recognizes youtube.com/watch, youtu.be, /shorts, and /embed links and
 *  returns an embeddable player URL — anything else falls back to a plain
 *  "Open course" link instead of trying to embed it. */
function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.replace('www.', '') === 'youtu.be') {
      id = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/embed/')[1];
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/shorts/')[1];
    }
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return null;
  }
}

export default function TrainingPage() {
  const { session, ready, call } = useApi();
  const [myCourses, setMyCourses] = useState<Assignment[]>([]);
  const [openAssignment, setOpenAssignment] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = session?.user.role;
  const canAssign = role === 'ADMIN' || role === 'SUPERVISOR' || role === 'HR';

  async function refresh() {
    if (!ready) return;
    try {
      setMyCourses(await call<Assignment[]>('/training/my-courses'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your courses.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Training</h1>
        <p className="text-sm text-slate-500">Watch what's been assigned to you and track your progress.</p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">My Courses</h2>
        {myCourses.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing assigned to you yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myCourses.map((a) => (
              <button key={a.id} onClick={() => setOpenAssignment(a)} className="card block text-left hover:border-brand-blue/40">
                <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                  {a.course.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.course.imageUrl} alt={a.course.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <IconPlay />
                    </div>
                  )}
                </div>
                <p className="truncate text-sm font-semibold text-ink">{a.course.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge status={a.status} kind="course" />
                  {a.scorePercent !== null && a.status === 'COMPLETED' && (
                    <span className="text-xs text-slate-500">Score: {a.scorePercent}%</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {canAssign && <AssignCoursesPanel call={call} />}

      {openAssignment && (
        <CoursePlayerModal
          assignment={openAssignment}
          call={call}
          onClose={() => setOpenAssignment(null)}
          onChanged={async () => {
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function CoursePlayerModal({
  assignment,
  call,
  onClose,
  onChanged,
}: {
  assignment: Assignment;
  call: ReturnType<typeof useApi>['call'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const [taking, setTaking] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestionToTake[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(assignment.status);
  const [localScore, setLocalScore] = useState(assignment.scorePercent);

  const hasQuiz = (assignment.course.quizQuestions?.length ?? 0) > 0;
  const embedUrl = youtubeEmbedUrl(assignment.course.courseUrl);

  useEffect(() => {
    if (assignment.status === 'PENDING') {
      call(`/training/assignments/${assignment.id}/start`, { method: 'POST' })
        .then(() => {
          setLocalStatus('STARTED');
          onChanged();
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startQuiz() {
    setError(null);
    try {
      const q = await call<QuizQuestionToTake[]>(`/training/assignments/${assignment.id}/quiz`);
      setQuiz(q);
      setAnswers({});
      setTaking(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the quiz.');
    }
  }

  async function submitQuiz() {
    if (!quiz) return;
    setError(null);
    setSubmitting(true);
    try {
      const answersArr = Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId }));
      const updated = await call<{ status: string; scorePercent: number | null }>(`/training/assignments/${assignment.id}/submit-quiz`, {
        method: 'POST',
        body: JSON.stringify({ answers: answersArr }),
      });
      setLocalStatus(updated.status as Assignment['status']);
      setLocalScore(updated.scorePercent);
      setTaking(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the quiz.');
    } finally {
      setSubmitting(false);
    }
  }

  async function markComplete() {
    setMarkingComplete(true);
    setError(null);
    try {
      await call(`/training/assignments/${assignment.id}/complete`, { method: 'POST' });
      setLocalStatus('COMPLETED');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark this as complete.');
    } finally {
      setMarkingComplete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={onClose}>
      <div
        className={`flex max-h-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all ${
          maximized ? 'h-full w-full' : 'w-full max-w-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{assignment.course.title}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <StatusBadge status={localStatus} kind="course" />
              {localScore !== null && localStatus === 'COMPLETED' && <span className="text-xs text-slate-500">Score: {localScore}%</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn-secondary py-1" onClick={() => setMaximized((v) => !v)} title={maximized ? 'Restore' : 'Maximize'}>
              {maximized ? <IconMinimize /> : <IconMaximize />}
            </button>
            <button className="btn-secondary py-1" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {!taking ? (
            <>
              {embedUrl ? (
                <div className={`w-full overflow-hidden rounded-xl bg-black ${maximized ? 'h-[70vh]' : 'aspect-video'}`}>
                  <iframe
                    src={embedUrl}
                    className="h-full w-full"
                    title={assignment.course.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  This course's link isn't an embeddable video.{' '}
                  <a className="font-medium text-brand-blue underline" href={assignment.course.courseUrl} target="_blank" rel="noreferrer">
                    Open course
                  </a>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                {hasQuiz ? (
                  <button className="btn-primary" onClick={startQuiz}>
                    {localStatus === 'COMPLETED' ? 'Retake quiz' : 'Take quiz'}
                  </button>
                ) : localStatus !== 'COMPLETED' ? (
                  <button className="btn-primary" onClick={markComplete} disabled={markingComplete}>
                    {markingComplete ? 'Saving…' : 'Mark as complete'}
                  </button>
                ) : (
                  <p className="text-sm text-emerald-700">Completed.</p>
                )}
              </div>
            </>
          ) : (
            quiz && (
              <div className="space-y-4">
                {quiz.map((q, qi) => (
                  <div key={q.id} className="rounded-xl border border-slate-100 p-3">
                    <p className="mb-2 text-sm font-medium text-ink">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === o.id}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                          />
                          {o.optionText}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={submitQuiz}
                    disabled={submitting || Object.keys(answers).length < quiz.length}
                  >
                    {submitting ? 'Submitting…' : 'Submit quiz'}
                  </button>
                  <button className="btn-secondary" onClick={() => setTaking(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function AssignCoursesPanel({ call }: { call: ReturnType<typeof useApi>['call'] }) {
  const [published, setPublished] = useState<CourseSummary[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [courseId, setCourseId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pub, emp] = await Promise.all([call<CourseSummary[]>('/training/published'), call<StaffMember[]>('/employees')]);
        setPublished(pub);
        setStaff(emp);
        if (pub.length > 0) setCourseId(pub[0].id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load courses/staff.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assign() {
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await call<{ assigned: number; skipped: number }>('/training/assignments', {
        method: 'POST',
        body: JSON.stringify({ courseId, employeeIds: [...selected] }),
      });
      setMessage(
        `Assigned to ${res.assigned} ${res.assigned === 1 ? 'person' : 'people'}${res.skipped > 0 ? ` (${res.skipped} already assigned)` : ''}.`,
      );
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign the course.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Assign Courses</h2>
      {published.length === 0 ? (
        <p className="text-sm text-slate-500">No published courses yet — publish one under Settings → Training.</p>
      ) : (
        <div className="card space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          <div>
            <label className="label">Course</label>
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {published.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Staff members</label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <Avatar name={`${s.firstName} ${s.lastName}`} photoUrl={s.photoUrl} size="sm" />
                  <span className="text-ink">
                    {s.firstName} {s.lastName}
                  </span>
                  {s.jobTitle && <span className="text-xs text-slate-400">· {s.jobTitle}</span>}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={assign} disabled={assigning || selected.size === 0}>
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}
    </div>
  );
}

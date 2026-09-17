'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { IconPencil, IconPlus, IconTrash, IconUpload } from '@/components/icons';

interface QuizOption {
  id?: string;
  optionText: string;
  isCorrect: boolean;
}
interface QuizQuestion {
  id?: string;
  question: string;
  options: QuizOption[];
}
interface Course {
  id: string;
  title: string;
  imageUrl: string | null;
  courseUrl: string;
  published: boolean;
  quizQuestions?: QuizQuestion[];
}

function blankQuestion(): QuizQuestion {
  return {
    question: '',
    options: [
      { optionText: '', isCorrect: true },
      { optionText: '', isCorrect: false },
    ],
  };
}

export default function TrainingSettingsPage() {
  const { ready, call, upload } = useApi();
  const [courses, setCourses] = useState<Course[]>([]);
  const [title, setTitle] = useState('');
  const [courseUrl, setCourseUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizEditorId, setQuizEditorId] = useState<string | null>(null);

  async function refresh() {
    if (!ready) return;
    try {
      setCourses(await call<Course[]>('/settings/training/courses'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load courses.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await call('/settings/training/courses', { method: 'POST', body: JSON.stringify({ title, courseUrl }) });
      setTitle('');
      setCourseUrl('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add course.');
    } finally {
      setCreating(false);
    }
  }

  async function uploadImage(courseId: string, file: File) {
    setError(null);
    try {
      await upload<Course>(`/settings/training/courses/${courseId}/image`, file);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload image.');
    }
  }

  async function togglePublish(course: Course) {
    setError(null);
    try {
      await call(`/settings/training/courses/${course.id}/${course.published ? 'unpublish' : 'publish'}`, { method: 'POST' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the course.');
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await call(`/settings/training/courses/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the course.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Courses</h2>
        <p className="text-xs text-slate-400">
          Add a course, set an optional quiz, then Publish to make it available for Supervisors and Admins to assign
          under Training → Assign Courses.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={addCourse} className="card grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="label">Course title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Course URL (YouTube link plays embedded)</label>
          <input
            className="input"
            value={courseUrl}
            onChange={(e) => setCourseUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            required
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full sm:w-auto" disabled={creating}>
            <IconPlus /> {creating ? 'Adding…' : 'Add course'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {courses.length === 0 && <p className="text-sm text-slate-500">No courses yet — add one above.</p>}
        {courses.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            editingQuiz={quizEditorId === c.id}
            onToggleQuiz={() => setQuizEditorId(quizEditorId === c.id ? null : c.id)}
            onUploadImage={(file) => uploadImage(c.id, file)}
            onTogglePublish={() => togglePublish(c)}
            onDelete={() => remove(c.id)}
            onSaved={refresh}
            call={call}
          />
        ))}
      </div>
    </div>
  );
}

function CourseCard({
  course,
  editingQuiz,
  onToggleQuiz,
  onUploadImage,
  onTogglePublish,
  onDelete,
  onSaved,
  call,
}: {
  course: Course;
  editingQuiz: boolean;
  onToggleQuiz: () => void;
  onUploadImage: (file: File) => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onSaved: () => void;
  call: ReturnType<typeof useApi>['call'];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [title, setTitle] = useState(course.title);
  const [courseUrl, setCourseUrl] = useState(course.courseUrl);
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    course.quizQuestions && course.quizQuestions.length > 0 ? course.quizQuestions : [],
  );
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  async function saveDetails() {
    setSavingDetails(true);
    try {
      await call(`/settings/training/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify({ title, courseUrl }) });
      setEditingDetails(false);
      onSaved();
    } finally {
      setSavingDetails(false);
    }
  }

  function updateQuestion(qi: number, question: string) {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, question } : q)));
  }
  function updateOption(qi: number, oi: number, patch: Partial<QuizOption>) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qi
          ? q
          : {
              ...q,
              options: q.options.map((o, j) =>
                j !== oi ? { ...o, isCorrect: patch.isCorrect !== undefined ? false : o.isCorrect } : { ...o, ...patch },
              ),
            },
      ),
    );
  }
  function addOption(qi: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, options: [...q.options, { optionText: '', isCorrect: false }] } : q)));
  }
  function removeOption(qi: number, oi: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q)));
  }
  function addQuestion() {
    setQuestions((prev) => [...prev, blankQuestion()]);
  }
  function removeQuestion(qi: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== qi));
  }

  async function saveQuiz() {
    setQuizError(null);
    for (const q of questions) {
      if (q.options.filter((o) => o.isCorrect).length !== 1) {
        setQuizError(`Each question needs exactly one correct option (check "${q.question || 'untitled question'}").`);
        return;
      }
    }
    setSavingQuiz(true);
    try {
      await call(`/settings/training/courses/${course.id}/quiz`, {
        method: 'PATCH',
        body: JSON.stringify({ questions: questions.map((q) => ({ question: q.question, options: q.options })) }),
      });
      onSaved();
    } catch (err) {
      setQuizError(err instanceof ApiError ? err.message : 'Could not save the quiz.');
    } finally {
      setSavingQuiz(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        {course.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.imageUrl} alt={course.title} className="h-16 w-24 rounded-lg border border-slate-200 object-cover" />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
            No image
          </div>
        )}
        <div className="min-w-0 flex-1">
          {editingDetails ? (
            <div className="space-y-2">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="input" value={courseUrl} onChange={(e) => setCourseUrl(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-primary py-1" onClick={saveDetails} disabled={savingDetails}>
                  Save
                </button>
                <button className="btn-secondary py-1" onClick={() => setEditingDetails(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-semibold text-ink">{course.title}</p>
              <p className="truncate text-xs text-slate-400">{course.courseUrl}</p>
              <span className={`badge mt-1 ${course.published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {course.published ? 'Published' : 'Draft'}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadImage(file);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <button className="btn-secondary py-1" onClick={() => fileRef.current?.click()} title="Upload course image">
            <IconUpload />
          </button>
          <button className="btn-secondary py-1" onClick={() => setEditingDetails((v) => !v)} title="Edit title/URL">
            <IconPencil />
          </button>
          <button className="btn-secondary py-1" onClick={onToggleQuiz}>
            {editingQuiz ? 'Close quiz' : `Set quiz${course.quizQuestions?.length ? ` (${course.quizQuestions.length})` : ''}`}
          </button>
          <button className="btn-secondary py-1" onClick={onTogglePublish}>
            {course.published ? 'Unpublish' : 'Publish'}
          </button>
          <button className="text-slate-400 hover:text-red-600" onClick={onDelete} title="Delete course">
            <IconTrash />
          </button>
        </div>
      </div>

      {editingQuiz && (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          {quizError && <p className="text-sm text-red-600">{quizError}</p>}
          {questions.length === 0 && <p className="text-xs text-slate-400">No questions yet — add one below.</p>}
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  placeholder={`Question ${qi + 1}`}
                  value={q.question}
                  onChange={(e) => updateQuestion(qi, e.target.value)}
                />
                <button className="text-slate-400 hover:text-red-600" onClick={() => removeQuestion(qi)} title="Remove question">
                  <IconTrash />
                </button>
              </div>
              <div className="space-y-1.5 pl-1">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={o.isCorrect}
                      onChange={() => updateOption(qi, oi, { isCorrect: true })}
                      title="Mark as the correct answer"
                    />
                    <input
                      className="input"
                      placeholder={`Option ${oi + 1}`}
                      value={o.optionText}
                      onChange={(e) => updateOption(qi, oi, { optionText: e.target.value })}
                    />
                    <button className="text-slate-400 hover:text-red-600" onClick={() => removeOption(qi, oi)} title="Remove option">
                      <IconTrash />
                    </button>
                  </div>
                ))}
                <button className="text-xs font-medium text-brand-blue" onClick={() => addOption(qi)}>
                  + Add option
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button className="btn-secondary py-1" onClick={addQuestion}>
              <IconPlus /> Add question
            </button>
            <button className="btn-primary py-1" onClick={saveQuiz} disabled={savingQuiz}>
              {savingQuiz ? 'Saving…' : 'Save quiz'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

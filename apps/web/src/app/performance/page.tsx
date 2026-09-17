'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  dueDate: string | null;
}

export default function PerformancePage() {
  const { session, ready, call } = useApi();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!ready) return;
    try {
      setGoals(await call<Goal[]>('/performance/goals/me'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load goals.');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await call('/performance/goals', { method: 'POST', body: JSON.stringify({ title }) });
    setTitle('');
    refresh();
  }

  async function cycle(goal: Goal) {
    const next: Record<Goal['status'], Goal['status']> = {
      NOT_STARTED: 'IN_PROGRESS',
      IN_PROGRESS: 'COMPLETED',
      COMPLETED: 'NOT_STARTED',
    };
    await call(`/performance/goals/${goal.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next[goal.status] }),
    });
    refresh();
  }

  if (!ready) return null;

  if (session?.user.role === 'ADMIN' || session?.user.role === 'HR') {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">Performance Management</h1>
        <p className="text-sm text-slate-500">
          Goal-setting is scoped per employee — sign in as an employee or supervisor to see it. Review cycles and
          360° reviews are modeled in the schema but not yet wired up here (Phase 3 of the roadmap).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Your goals</h1>
        <p className="text-sm text-slate-500">Click a goal to cycle its status.</p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={create} className="card flex gap-3">
        <input
          className="input"
          placeholder="e.g. Ship the leave-approval flow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn-primary whitespace-nowrap">Add goal</button>
      </form>

      <div className="space-y-2">
        {goals.map((g) => (
          <button key={g.id} onClick={() => cycle(g)} className="card flex w-full items-center justify-between text-left">
            <span className="text-sm text-ink">{g.title}</span>
            <span className={`badge ${statusStyle[g.status]}`}>{g.status.replace('_', ' ')}</span>
          </button>
        ))}
        {goals.length === 0 && <p className="text-sm text-slate-500">No goals yet — add one above.</p>}
      </div>
    </div>
  );
}

const statusStyle: Record<Goal['status'], string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
};

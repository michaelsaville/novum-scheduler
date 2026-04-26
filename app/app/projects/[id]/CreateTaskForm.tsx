'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createTask, type TaskFormState } from '@/app/tasks/actions';
import { DURATION_OPTIONS } from '@/lib/time';

const initial: TaskFormState = { ok: false, error: null };

export default function CreateTaskForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createTask, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="title"
        required
        maxLength={200}
        placeholder="New task title…"
        className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      <textarea
        name="description"
        rows={2}
        placeholder="Description (optional)"
        className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
        <span>Estimated time</span>
        <select
          name="estimatedMinutes"
          defaultValue=""
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="">—</option>
          {DURATION_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
          {pending ? 'Adding…' : 'Add task'}
        </button>
        {state.error && <span className="text-xs text-red-700 dark:text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}

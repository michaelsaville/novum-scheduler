'use client';

import { useActionState } from 'react';
import { scheduleNextAvailable, type ScheduleNextState } from '@/app/tasks/actions';
import { formatDuration, DEFAULT_DURATION_MIN } from '@/lib/time';

const initial: ScheduleNextState = { ok: false, error: null, message: null };

type Installer = { id: string; name: string; color: string | null };

type Props = {
  taskId: string;
  estimatedMinutes: number | null;
  currentInstallerId: string | null;
  installers: Installer[];
};

export default function ScheduleNextButton({
  taskId,
  estimatedMinutes,
  currentInstallerId,
  installers,
}: Props) {
  const [state, formAction, pending] = useActionState(scheduleNextAvailable, initial);

  if (installers.length === 0) {
    return (
      <p className="text-xs text-neutral-500">
        No active installers — create one at <a className="underline" href="/admin/users">Admin · Users</a>.
      </p>
    );
  }

  const defaultInstaller = currentInstallerId ?? installers[0].id;
  const durationLabel = formatDuration(estimatedMinutes ?? DEFAULT_DURATION_MIN);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium">Auto-schedule</h3>
        <span className="text-xs text-neutral-500">
          Finds the first {durationLabel} gap on the chosen installer&apos;s calendar.
        </span>
      </header>
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Installer</span>
          <select
            name="installerId"
            defaultValue={defaultInstaller}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800"
          >
            {installers.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          {pending ? 'Finding…' : 'Schedule next available'}
        </button>
      </div>
      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.message && state.ok && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          ✓ {state.message}
        </p>
      )}
    </form>
  );
}

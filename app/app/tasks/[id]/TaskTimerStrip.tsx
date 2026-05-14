'use client';

import { useEffect, useState } from 'react';
import { startTaskTimer, stopTaskTimer } from '@/app/tasks/actions';
import { formatHMS } from '@/lib/timer';

/**
 * Inline timer control for the task detail page. Mirrors the /me
 * RunningTimerBar but lives next to the status row so the operator can
 * start/stop without navigating away. Renders Stop + live counter when
 * the viewer's own timer is running on this task; otherwise renders
 * Start.
 *
 * Note: when the viewer has a timer running on a *different* task,
 * tapping Start here will silently auto-stop the other one (server
 * action enforces single-active). The brief total label below is the
 * tech's hint that they've been logging time on this task before.
 */
export function TaskTimerStrip({
  taskId,
  isRunningForMe,
  startedAtMs,
  totalLabel,
}: {
  taskId: string;
  isRunningForMe: boolean;
  startedAtMs: number | null;
  totalLabel: string;
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isRunningForMe && startedAtMs != null ? (
          <RunningCounter startedAtMs={startedAtMs} />
        ) : (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {totalLabel}
          </span>
        )}
      </div>
      {isRunningForMe ? (
        <form action={stopTaskTimer}>
          <input type="hidden" name="taskId" value={taskId} />
          <button
            type="submit"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            ■ Stop timer
          </button>
        </form>
      ) : (
        <form action={startTaskTimer}>
          <input type="hidden" name="taskId" value={taskId} />
          <button
            type="submit"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            ▶ Start timer
          </button>
        </form>
      )}
    </div>
  );
}

function RunningCounter({ startedAtMs }: { startedAtMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, now - startedAtMs);
  return (
    <span className="font-mono text-base tabular-nums text-emerald-800 dark:text-emerald-300">
      ⏱ {formatHMS(elapsed)} running
    </span>
  );
}

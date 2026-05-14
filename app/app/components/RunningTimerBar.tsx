'use client';

import { useEffect, useState } from 'react';
import { stopTaskTimer } from '@/app/tasks/actions';
import { formatHMS } from '@/lib/timer';

/**
 * Pinned bar that shows the user's currently-running timer. Renders
 * nothing when idle. Always visible at the top of /me so the operator
 * can stop the timer without finding the task again.
 *
 * Server hands us `startedAtMs` so the lazy initial render matches —
 * the client tick computes elapsed = Date.now() - startedAtMs each
 * second.
 */
export function RunningTimerBar({
  taskId,
  taskTitle,
  projectName,
  projectColor,
  startedAtMs,
}: {
  taskId: string;
  taskTitle: string;
  projectName: string;
  projectColor: string | null;
  startedAtMs: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, now - startedAtMs);

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-emerald-300 bg-emerald-50 px-4 py-2 sm:-mx-6 sm:px-6 dark:border-emerald-800 dark:bg-emerald-950">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <span aria-hidden className="text-lg" role="presentation">
          ⏱
        </span>
        <a
          href={`/tasks/${taskId}`}
          className="min-w-0 flex-1 leading-tight"
          aria-label={`Open ${taskTitle}`}
        >
          <div className="flex items-center gap-2">
            {projectColor && (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: projectColor }}
              />
            )}
            <span className="truncate text-xs text-emerald-900 dark:text-emerald-200">
              {projectName}
            </span>
          </div>
          <div className="truncate text-sm font-medium text-emerald-950 dark:text-emerald-50">
            {taskTitle}
          </div>
        </a>
        <span className="font-mono text-base tabular-nums text-emerald-950 dark:text-emerald-50">
          {formatHMS(elapsed)}
        </span>
        <form action={stopTaskTimer}>
          <input type="hidden" name="taskId" value={taskId} />
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            ■ Stop
          </button>
        </form>
      </div>
    </div>
  );
}

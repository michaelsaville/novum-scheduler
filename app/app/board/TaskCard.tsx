'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardTask } from './Board';
import { formatTime, formatDuration } from '@/lib/time';

type Props = {
  task: BoardTask;
  containerId: string;
  overlay?: boolean;
  onUnschedule?: (taskId: string) => void;
  onAutoSchedule?: (taskId: string) => void;
};

export default function TaskCard({ task, containerId, overlay = false, onUnschedule, onAutoSchedule }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { containerId },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging && !overlay ? 0.4 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded border bg-white p-2 text-sm shadow-sm active:cursor-grabbing dark:bg-neutral-800 ${
        overlay
          ? 'rotate-1 border-blue-400 shadow-lg'
          : 'border-neutral-200 dark:border-neutral-700'
      }`}
    >
      <div className="flex items-center gap-2">
        {task.project.color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: task.project.color }}
          />
        )}
        <span className="truncate text-xs text-neutral-500">
          {task.project.name}
          {task.project.clientName ? ` · ${task.project.clientName}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <StatusPill status={task.status} />
          {onUnschedule && containerId !== 'pool' && !overlay && (
            <button
              type="button"
              aria-label="Remove from schedule"
              title="Remove from schedule"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onUnschedule(task.id);
              }}
              className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-300"
            >
              <span aria-hidden="true" className="text-base leading-none">×</span>
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 line-clamp-3 font-medium">{task.title}</p>
      {(task.scheduledStartMinute !== null || task.estimatedMinutes !== null) && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          {task.scheduledStartMinute !== null && <span>🕒 {formatTime(task.scheduledStartMinute)}</span>}
          {task.estimatedMinutes !== null && <span>⏱ {formatDuration(task.estimatedMinutes)}</span>}
        </div>
      )}
      {onAutoSchedule && containerId === 'pool' && !overlay && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAutoSchedule(task.id);
          }}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded border border-emerald-300 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
          title="Find the first contiguous gap that fits this task"
        >
          ⚡ Auto-schedule
        </button>
      )}
    </article>
  );
}

function StatusPill({ status }: { status: BoardTask['status'] }) {
  const map: Record<BoardTask['status'], string> = {
    pending: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  if (status === 'pending') return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

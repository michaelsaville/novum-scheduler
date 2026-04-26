'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { BoardTask } from './Board';
import { formatTimeRange, formatDuration, DEFAULT_DURATION_MIN } from '@/lib/time';

type Props = {
  task: BoardTask;
  containerId: string;
  top: number;
  height: number;
  onUnschedule?: (taskId: string) => void;
};

export default function TimelineCard({ task, containerId, top, height, onUnschedule }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { containerId, kind: 'timeline-card' },
  });

  const dur = task.estimatedMinutes ?? DEFAULT_DURATION_MIN;
  const range = task.scheduledStartMinute !== null
    ? formatTimeRange(task.scheduledStartMinute, dur)
    : formatDuration(dur);

  const accent = task.project.color ?? '#737373';

  // Translucent overlay tint for status states. Pure white card looks too
  // featureless; a hairline left bar in the project color does most of the
  // identity work and the status pill carries the rest.
  const statusBg: Record<BoardTask['status'], string> = {
    pending: 'bg-white dark:bg-neutral-800',
    in_progress: 'bg-blue-50 dark:bg-blue-950/40',
    done: 'bg-green-50 dark:bg-green-950/40',
    blocked: 'bg-red-50 dark:bg-red-950/40',
  };

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        position: 'absolute',
        top,
        left: 4,
        right: 4,
        height,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : 1,
        borderLeft: `3px solid ${accent}`,
      }}
      className={`cursor-grab overflow-hidden rounded border border-neutral-200 px-2 py-1 text-xs shadow-sm active:cursor-grabbing dark:border-neutral-700 ${statusBg[task.status]}`}
    >
      <div className="flex items-center gap-1">
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {task.project.name}
        </span>
        {onUnschedule && (
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
            className="ml-auto inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-300"
          >
            <span aria-hidden className="text-sm leading-none">×</span>
          </button>
        )}
      </div>
      <p className="line-clamp-2 font-medium leading-tight">{task.title}</p>
      <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{range}</p>
    </article>
  );
}

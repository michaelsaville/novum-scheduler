'use client';

import { useDroppable } from '@dnd-kit/core';
import { formatTime } from '@/lib/time';

type Props = {
  installerId: string;
  minute: number;
  height: number;
  showLabel: boolean;
};

export default function HourSlot({ installerId, minute, height, showLabel }: Props) {
  const id = `slot:${installerId}|${minute}`;
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { containerId: id, installerId, minute, kind: 'hour-slot' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ height }}
      className={`relative border-t border-neutral-200 dark:border-neutral-800 ${
        isOver ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
      }`}
    >
      {showLabel && (
        <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
          {formatTime(minute)}
        </span>
      )}
    </div>
  );
}

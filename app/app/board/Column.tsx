'use client';

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

type Props = {
  id: string;
  title: string;
  subtitle?: string;
  accent: string | null;
  children: ReactNode;
};

export default function Column({ id, title, subtitle, accent, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${id}`,
    data: { containerId: id },
  });

  return (
    <section
      ref={setNodeRef}
      className={`flex h-full min-h-[200px] flex-col rounded border bg-white p-2 transition-colors dark:bg-neutral-900 ${
        isOver
          ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <header className="flex items-center gap-2 px-1 pb-2">
        {accent && (
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        )}
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <span className="ml-auto text-xs text-neutral-500">{subtitle}</span>}
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">{children}</div>
    </section>
  );
}

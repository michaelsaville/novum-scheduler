'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { moveTask, type MoveTaskTarget } from '@/app/tasks/actions';
import TaskCard from './TaskCard';
import TimelineCard from './TimelineCard';
import Column from './Column';
import HourSlot from './HourSlot';
import {
  DAY_START_MIN,
  DAY_END_MIN,
  HOUR_SLOTS,
  DEFAULT_DURATION_MIN,
} from '@/lib/time';

const PX_PER_HOUR = 60;
const COLUMN_HEIGHT = ((DAY_END_MIN - DAY_START_MIN) / 60) * PX_PER_HOUR;

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  scheduledOrder: number | null;
  scheduledStartMinute: number | null;
  estimatedMinutes: number | null;
  assignedInstallerId: string | null;
  project: { id: string; name: string; color: string | null; clientName: string | null };
};

type Installer = { id: string; name: string; color: string | null };

type ColumnKey = 'pool' | `installer:${string}`;

type Props = {
  dateISO: string;
  installers: Installer[];
  initialPool: BoardTask[];
  initialScheduled: BoardTask[];
};

function buildInitialColumns(
  installers: Installer[],
  pool: BoardTask[],
  scheduled: BoardTask[],
): Record<ColumnKey, BoardTask[]> {
  const cols: Record<ColumnKey, BoardTask[]> = { pool: [...pool] };
  for (const i of installers) cols[`installer:${i.id}` as ColumnKey] = [];
  for (const t of scheduled) {
    if (!t.assignedInstallerId) continue;
    const k = `installer:${t.assignedInstallerId}` as ColumnKey;
    if (!cols[k]) cols[k] = [];
    cols[k].push(t);
  }
  return cols;
}

function findColumnOf(cols: Record<ColumnKey, BoardTask[]>, taskId: string): ColumnKey | null {
  for (const key of Object.keys(cols) as ColumnKey[]) {
    if (cols[key].some((t) => t.id === taskId)) return key;
  }
  return null;
}

function topPx(startMinute: number | null): number {
  const m = startMinute ?? DAY_START_MIN;
  return ((m - DAY_START_MIN) / 60) * PX_PER_HOUR;
}

function heightPx(durationMin: number | null): number {
  const m = durationMin ?? DEFAULT_DURATION_MIN;
  return Math.max(28, (m / 60) * PX_PER_HOUR);
}

export default function Board({ dateISO, installers, initialPool, initialScheduled }: Props) {
  const [columns, setColumns] = useState<Record<ColumnKey, BoardTask[]>>(() =>
    buildInitialColumns(installers, initialPool, initialScheduled),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTask = useMemo<BoardTask | null>(() => {
    if (!activeId) return null;
    for (const list of Object.values(columns)) {
      const t = list.find((x) => x.id === activeId);
      if (t) return t;
    }
    return null;
  }, [activeId, columns]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setErrorMsg(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    setActiveId(null);

    const { over } = e;
    if (!over) return;

    const fromCol = findColumnOf(columns, taskId);
    if (!fromCol) return;

    const overData = over.data.current as
      | { kind?: string; installerId?: string; minute?: number; containerId?: string }
      | undefined;

    // Drop onto an hour slot in an installer column.
    if (overData?.kind === 'hour-slot' && overData.installerId && typeof overData.minute === 'number') {
      const toCol = `installer:${overData.installerId}` as ColumnKey;
      const startMinute = overData.minute;

      // Optimistic local state: remove from old column, place in new with new start time.
      setColumns((prev) => {
        const fromArr = prev[fromCol];
        const t = fromArr.find((x) => x.id === taskId);
        if (!t) return prev;
        const moved: BoardTask = {
          ...t,
          assignedInstallerId: overData.installerId!,
          scheduledStartMinute: startMinute,
        };
        const newFrom = fromArr.filter((x) => x.id !== taskId);
        const newTo = [...(prev[toCol] ?? []).filter((x) => x.id !== taskId), moved];
        return { ...prev, [fromCol]: newFrom, [toCol]: newTo };
      });

      const target: MoveTaskTarget = {
        kind: 'column',
        installerId: overData.installerId,
        dateISO,
        startMinute,
      };
      startTransition(async () => {
        const r = await moveTask({ taskId, target });
        if (!r.ok) setErrorMsg(r.error ?? 'Move failed.');
      });
      return;
    }

    // Drop onto the pool sortable list (or a card inside it).
    const overContainerId = overData?.containerId ?? String(over.id);
    const isPoolDrop =
      overContainerId === 'pool' ||
      String(over.id) === 'col:pool' ||
      columns.pool.some((t) => t.id === String(over.id));

    if (isPoolDrop && fromCol !== 'pool') {
      setColumns((prev) => {
        const fromArr = prev[fromCol];
        const t = fromArr.find((x) => x.id === taskId);
        if (!t) return prev;
        const moved: BoardTask = {
          ...t,
          assignedInstallerId: null,
          scheduledStartMinute: null,
          scheduledOrder: null,
        };
        return {
          ...prev,
          [fromCol]: fromArr.filter((x) => x.id !== taskId),
          pool: [moved, ...prev.pool],
        };
      });
      startTransition(async () => {
        const r = await moveTask({ taskId, target: { kind: 'pool' } });
        if (!r.ok) setErrorMsg(r.error ?? 'Move failed.');
      });
    }
  }

  function handleUnschedule(taskId: string) {
    const fromCol = findColumnOf(columns, taskId);
    if (!fromCol || fromCol === 'pool') return;

    setColumns((prev) => {
      const fromArr = prev[fromCol];
      const t = fromArr.find((x) => x.id === taskId);
      if (!t) return prev;
      const moved: BoardTask = {
        ...t,
        assignedInstallerId: null,
        scheduledStartMinute: null,
        scheduledOrder: null,
      };
      return {
        ...prev,
        [fromCol]: fromArr.filter((x) => x.id !== taskId),
        pool: [moved, ...prev.pool],
      };
    });

    startTransition(async () => {
      const r = await moveTask({ taskId, target: { kind: 'pool' } });
      if (!r.ok) setErrorMsg(r.error ?? 'Move failed.');
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {errorMsg && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
        {/* Pool sidebar — sortable list (no time slots). */}
        <div className="lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          <Column
            id="pool"
            title="Project pool"
            subtitle={`${columns.pool.length} unscheduled`}
            accent={null}
          >
            <SortableContext
              items={columns.pool.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {columns.pool.map((t) => (
                <TaskCard key={t.id} task={t} containerId="pool" />
              ))}
              {columns.pool.length === 0 && (
                <p className="text-xs text-neutral-500">All tasks scheduled.</p>
              )}
            </SortableContext>
          </Column>
        </div>

        {/* Installer timeline columns. */}
        <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
          {installers.map((i) => {
            const colKey = `installer:${i.id}` as ColumnKey;
            const tasks = columns[colKey] ?? [];
            return (
              <section
                key={i.id}
                className="flex flex-col rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              >
                <header className="flex items-center gap-2 border-b border-neutral-200 px-2 py-2 dark:border-neutral-800">
                  {i.color && (
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
                  )}
                  <h2 className="text-sm font-semibold">{i.name}</h2>
                  <span className="ml-auto text-xs text-neutral-500">
                    {tasks.length} task{tasks.length === 1 ? '' : 's'}
                  </span>
                </header>
                <div
                  className="relative"
                  style={{ height: COLUMN_HEIGHT }}
                >
                  {/* Hour drop zones (background) */}
                  {HOUR_SLOTS.map((m) => (
                    <HourSlot
                      key={m}
                      installerId={i.id}
                      minute={m}
                      height={PX_PER_HOUR}
                      showLabel
                    />
                  ))}
                  {/* Task blocks (foreground, absolutely positioned) */}
                  {tasks.map((t) => (
                    <TimelineCard
                      key={t.id}
                      task={t}
                      containerId={colKey}
                      top={topPx(t.scheduledStartMinute)}
                      height={heightPx(t.estimatedMinutes)}
                      onUnschedule={handleUnschedule}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {installers.length === 0 && (
            <p className="text-sm text-neutral-500">
              No active installers. Create one at <a className="underline" href="/admin/users">Admin · Users</a>.
            </p>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} containerId="pool" overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

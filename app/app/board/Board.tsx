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
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { moveTask, type MoveTaskTarget } from '@/app/tasks/actions';
import TaskCard from './TaskCard';
import Column from './Column';

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  scheduledOrder: number | null;
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
  const columns: Record<ColumnKey, BoardTask[]> = { pool: [...pool] };
  for (const i of installers) {
    columns[`installer:${i.id}` as ColumnKey] = [];
  }
  for (const t of scheduled) {
    if (!t.assignedInstallerId) continue;
    const key = `installer:${t.assignedInstallerId}` as ColumnKey;
    if (!columns[key]) columns[key] = [];
    columns[key].push(t);
  }
  return columns;
}

function findColumnOf(
  columns: Record<ColumnKey, BoardTask[]>,
  taskId: string,
): ColumnKey | null {
  for (const key of Object.keys(columns) as ColumnKey[]) {
    if (columns[key].some((t) => t.id === taskId)) return key;
  }
  return null;
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

  // Cross-column hover preview: move the dragged task into the over-column
  // immediately so the user sees a real placeholder. Same-column reorder
  // is handled at drop time via arrayMove for stable indices.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const fromCol = findColumnOf(columns, activeIdStr);
    const toCol = (over.data.current?.containerId as ColumnKey | undefined) ??
      (overIdStr.startsWith('col:') ? (overIdStr.slice(4) as ColumnKey) : findColumnOf(columns, overIdStr));

    if (!fromCol || !toCol || fromCol === toCol) return;

    setColumns((prev) => {
      const fromArr = prev[fromCol];
      const toArr = prev[toCol] ?? [];
      const taskIndex = fromArr.findIndex((t) => t.id === activeIdStr);
      if (taskIndex === -1) return prev;
      const [moved] = [fromArr[taskIndex]];

      const newFrom = fromArr.filter((t) => t.id !== activeIdStr);
      const overIndex = toArr.findIndex((t) => t.id === overIdStr);
      const insertIndex = overIndex >= 0 ? overIndex : toArr.length;
      const newTo = [...toArr.slice(0, insertIndex), moved, ...toArr.slice(insertIndex)];

      return { ...prev, [fromCol]: newFrom, [toCol]: newTo };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const activeIdStr = String(e.active.id);
    setActiveId(null);

    const { over } = e;
    if (!over) return;
    const overIdStr = String(over.id);

    const fromCol = findColumnOf(columns, activeIdStr);
    if (!fromCol) return;

    // Same-column reorder.
    if (overIdStr !== `col:${fromCol}`) {
      const overInSameCol = columns[fromCol].some((t) => t.id === overIdStr);
      if (overInSameCol && overIdStr !== activeIdStr) {
        setColumns((prev) => {
          const arr = prev[fromCol];
          const oldIndex = arr.findIndex((t) => t.id === activeIdStr);
          const newIndex = arr.findIndex((t) => t.id === overIdStr);
          if (oldIndex < 0 || newIndex < 0) return prev;
          const moved = arrayMove(arr, oldIndex, newIndex);
          // Persist the reordering (pool is unordered server-side; only
          // installer columns need a server roundtrip).
          if (fromCol.startsWith('installer:')) {
            persistMove(activeIdStr, fromCol, moved.map((t) => t.id));
          }
          return { ...prev, [fromCol]: moved };
        });
        return;
      }
    }

    // Cross-column move already happened in handleDragOver.
    // Now persist the destination column's final ordering.
    const toCol = findColumnOf(columns, activeIdStr);
    if (!toCol) return;
    persistMove(activeIdStr, toCol, columns[toCol].map((t) => t.id));
  }

  function handleUnschedule(taskId: string) {
    const fromCol = findColumnOf(columns, taskId);
    if (!fromCol || fromCol === 'pool') return;

    setColumns((prev) => {
      const fromArr = prev[fromCol];
      const task = fromArr.find((t) => t.id === taskId);
      if (!task) return prev;
      return {
        ...prev,
        [fromCol]: fromArr.filter((t) => t.id !== taskId),
        pool: [task, ...prev.pool],
      };
    });

    startTransition(async () => {
      const result = await moveTask({ taskId, target: { kind: 'pool' } });
      if (!result.ok) setErrorMsg(result.error ?? 'Move failed.');
    });
  }

  function persistMove(taskId: string, toCol: ColumnKey, destOrderedTaskIds: string[]) {
    const target: MoveTaskTarget =
      toCol === 'pool'
        ? { kind: 'pool' }
        : { kind: 'column', installerId: toCol.slice('installer:'.length), dateISO };

    startTransition(async () => {
      const result = await moveTask({ taskId, target, destOrderedTaskIds });
      if (!result.ok) {
        setErrorMsg(result.error ?? 'Move failed.');
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {errorMsg && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
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
            </SortableContext>
          </Column>
        </div>

        <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-hidden">
          {installers.map((i) => {
            const colKey = `installer:${i.id}` as ColumnKey;
            const tasks = columns[colKey] ?? [];
            return (
              <Column
                key={i.id}
                id={colKey}
                title={i.name}
                subtitle={`${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
                accent={i.color}
              >
                <SortableContext
                  items={tasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      containerId={colKey}
                      onUnschedule={handleUnschedule}
                    />
                  ))}
                </SortableContext>
              </Column>
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

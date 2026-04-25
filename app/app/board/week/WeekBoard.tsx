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
import TaskCard from '@/app/board/TaskCard';
import Column from '@/app/board/Column';

export type WeekBoardTask = {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  scheduledOrder: number | null;
  assignedInstallerId: string | null;
  scheduledDateISO: string | null;
  project: { id: string; name: string; color: string | null; clientName: string | null };
};

type Installer = { id: string; name: string; color: string | null };
type DayHeader = { iso: string; weekday: string; dayNum: string; isToday: boolean };

// ColumnKey shapes: 'pool' | `cell:{installerId}|{dateISO}`
type ColumnKey = 'pool' | `cell:${string}|${string}`;

function cellKey(installerId: string, dateISO: string): ColumnKey {
  return `cell:${installerId}|${dateISO}` as ColumnKey;
}

function parseCellKey(key: ColumnKey): { installerId: string; dateISO: string } | null {
  if (!key.startsWith('cell:')) return null;
  const [installerId, dateISO] = key.slice('cell:'.length).split('|');
  if (!installerId || !dateISO) return null;
  return { installerId, dateISO };
}

type Props = {
  installers: Installer[];
  days: DayHeader[];
  initialPool: WeekBoardTask[];
  initialScheduled: WeekBoardTask[];
};

function buildColumns(
  installers: Installer[],
  days: DayHeader[],
  pool: WeekBoardTask[],
  scheduled: WeekBoardTask[],
): Record<ColumnKey, WeekBoardTask[]> {
  const cols: Record<ColumnKey, WeekBoardTask[]> = { pool: [...pool] };
  for (const i of installers) {
    for (const d of days) cols[cellKey(i.id, d.iso)] = [];
  }
  for (const t of scheduled) {
    if (!t.assignedInstallerId || !t.scheduledDateISO) continue;
    const k = cellKey(t.assignedInstallerId, t.scheduledDateISO);
    if (cols[k]) cols[k].push(t);
  }
  return cols;
}

function findColumnOf(
  columns: Record<ColumnKey, WeekBoardTask[]>,
  taskId: string,
): ColumnKey | null {
  for (const key of Object.keys(columns) as ColumnKey[]) {
    if (columns[key].some((t) => t.id === taskId)) return key;
  }
  return null;
}

export default function WeekBoard({ installers, days, initialPool, initialScheduled }: Props) {
  const [columns, setColumns] = useState<Record<ColumnKey, WeekBoardTask[]>>(() =>
    buildColumns(installers, days, initialPool, initialScheduled),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTask = useMemo<WeekBoardTask | null>(() => {
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

    if (overIdStr !== `col:${fromCol}`) {
      const overInSameCol = columns[fromCol].some((t) => t.id === overIdStr);
      if (overInSameCol && overIdStr !== activeIdStr) {
        setColumns((prev) => {
          const arr = prev[fromCol];
          const oldIndex = arr.findIndex((t) => t.id === activeIdStr);
          const newIndex = arr.findIndex((t) => t.id === overIdStr);
          if (oldIndex < 0 || newIndex < 0) return prev;
          const moved = arrayMove(arr, oldIndex, newIndex);
          if (fromCol !== 'pool') {
            persistMove(activeIdStr, fromCol, moved.map((t) => t.id));
          }
          return { ...prev, [fromCol]: moved };
        });
        return;
      }
    }

    const toCol = findColumnOf(columns, activeIdStr);
    if (!toCol) return;
    persistMove(activeIdStr, toCol, columns[toCol].map((t) => t.id));
  }

  function persistMove(taskId: string, toCol: ColumnKey, destOrderedTaskIds: string[]) {
    let target: MoveTaskTarget;
    if (toCol === 'pool') {
      target = { kind: 'pool' };
    } else {
      const parsed = parseCellKey(toCol);
      if (!parsed) return;
      target = { kind: 'column', installerId: parsed.installerId, dateISO: parsed.dateISO };
    }
    startTransition(async () => {
      const result = await moveTask({ taskId, target, destOrderedTaskIds });
      if (!result.ok) setErrorMsg(result.error ?? 'Move failed.');
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

      {/* Project pool — horizontal strip */}
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
          <div className="grid grid-flow-col auto-cols-[200px] gap-2 overflow-x-auto pb-1">
            {columns.pool.map((t) => (
              <TaskCard key={t.id} task={t} containerId="pool" />
            ))}
            {columns.pool.length === 0 && (
              <p className="text-sm text-neutral-500">Pool is empty.</p>
            )}
          </div>
        </SortableContext>
      </Column>

      {/* Week grid: header row + one row per installer */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(180px, 1fr))` }}
        >
          {/* Top-left empty corner */}
          <div></div>
          {/* Day headers */}
          {days.map((d) => (
            <div
              key={d.iso}
              className={`px-2 py-1 text-center text-xs font-medium ${
                d.isToday ? 'rounded bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100' : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <div>{d.weekday}</div>
              <div>{d.dayNum}</div>
            </div>
          ))}

          {/* Installer rows */}
          {installers.map((i) => (
            <Row key={i.id} installer={i} days={days} columns={columns} />
          ))}

          {installers.length === 0 && (
            <p className="col-span-full text-sm text-neutral-500">
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

function Row({
  installer,
  days,
  columns,
}: {
  installer: Installer;
  days: DayHeader[];
  columns: Record<ColumnKey, WeekBoardTask[]>;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1 text-sm font-semibold">
        {installer.color && (
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: installer.color }}
          />
        )}
        <span className="truncate">{installer.name}</span>
      </div>
      {days.map((d) => {
        const k = cellKey(installer.id, d.iso);
        const tasks = columns[k] ?? [];
        return (
          <Column
            key={k}
            id={k}
            title=""
            subtitle={tasks.length > 0 ? `${tasks.length}` : undefined}
            accent={null}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((t) => (
                <TaskCard key={t.id} task={t} containerId={k} />
              ))}
            </SortableContext>
          </Column>
        );
      })}
    </>
  );
}

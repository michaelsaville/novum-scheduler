import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  shiftDateISO,
  todayISO,
  nowMinuteInBusinessTz,
} from '@/lib/dates';
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  DEFAULT_DURATION_MIN,
} from '@/lib/time';

export type BusyInterval = {
  dateISO: string;
  startMin: number;
  endMin: number;
  taskId: string;
};

export type SlotOptions = {
  durationMin: number;
  fromDateISO: string;
  horizonDays?: number;
  skipWeekends?: boolean;
  workStartMin?: number;
  workEndMin?: number;
};

export type SlotResult =
  | { ok: true; dateISO: string; startMin: number; endMin: number }
  | { ok: false; error: string };

function snapUp(min: number, slot: number): number {
  return Math.ceil(min / slot) * slot;
}

/**
 * Finds the first contiguous gap >= durationMin within working hours,
 * walking forward day-by-day from `fromDateISO`. Pure function — no DB
 * access. Caller is responsible for excluding "self" when rescheduling
 * an existing task.
 */
export function findNextSlot(busy: BusyInterval[], opts: SlotOptions): SlotResult {
  const durationMin = Math.max(1, Math.floor(opts.durationMin));
  const horizonDays = opts.horizonDays ?? 30;
  const skipWeekends = opts.skipWeekends ?? true;
  const workStart = opts.workStartMin ?? DAY_START_MIN;
  const workEnd = opts.workEndMin ?? DAY_END_MIN;

  if (durationMin > workEnd - workStart) {
    return {
      ok: false,
      error: `Task duration (${durationMin}m) exceeds workday (${workEnd - workStart}m).`,
    };
  }

  // Group busy intervals by date for O(1) lookup.
  const byDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const b of busy) {
    if (b.endMin <= workStart || b.startMin >= workEnd) continue;
    const arr = byDate.get(b.dateISO) ?? [];
    arr.push({
      start: Math.max(b.startMin, workStart),
      end: Math.min(b.endMin, workEnd),
    });
    byDate.set(b.dateISO, arr);
  }

  const today = todayISO();
  let dateISO = opts.fromDateISO;

  for (let day = 0; day < horizonDays; day++) {
    const dow = new Date(dateISO + 'T00:00:00.000Z').getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    if (skipWeekends && isWeekend) {
      dateISO = shiftDateISO(dateISO, 1);
      continue;
    }

    // Initial cursor: workStart, except on today bump it forward to the
    // next slot boundary past "now" so we don't suggest a time in the past.
    let cursor = workStart;
    if (dateISO === today) {
      const nowMin = nowMinuteInBusinessTz();
      if (nowMin > cursor) cursor = Math.min(workEnd, snapUp(nowMin, SLOT_MIN));
    }

    const intervals = (byDate.get(dateISO) ?? []).slice().sort((a, b) => a.start - b.start);

    for (const iv of intervals) {
      if (iv.end <= cursor) continue;
      if (iv.start - cursor >= durationMin) {
        return { ok: true, dateISO, startMin: cursor, endMin: cursor + durationMin };
      }
      cursor = Math.max(cursor, iv.end);
    }
    if (workEnd - cursor >= durationMin) {
      return { ok: true, dateISO, startMin: cursor, endMin: cursor + durationMin };
    }

    dateISO = shiftDateISO(dateISO, 1);
  }

  return {
    ok: false,
    error: `No ${durationMin}-min gap in next ${horizonDays} days.`,
  };
}

/**
 * Loads an installer's busy intervals over [fromDateISO, fromDateISO+days)
 * and finds the next fit for `durationMin`. `excludeTaskId` removes the
 * task being rescheduled from the busy list so it doesn't conflict with
 * itself.
 */
export async function nextAvailableForInstaller(args: {
  installerId: string;
  durationMin: number;
  fromDateISO?: string;
  horizonDays?: number;
  excludeTaskId?: string;
}): Promise<SlotResult> {
  const fromDateISO = args.fromDateISO ?? todayISO();
  const horizonDays = args.horizonDays ?? 30;

  const start = new Date(fromDateISO + 'T00:00:00.000Z');
  const end = new Date(shiftDateISO(fromDateISO, horizonDays) + 'T00:00:00.000Z');

  const tasks = await prisma.task.findMany({
    where: {
      assignedInstallerId: args.installerId,
      scheduledDate: { gte: start, lt: end },
      status: { not: 'done' },
      project: { archivedAt: null },
      ...(args.excludeTaskId ? { id: { not: args.excludeTaskId } } : {}),
    },
    select: {
      id: true,
      scheduledDate: true,
      scheduledStartMinute: true,
      estimatedMinutes: true,
    },
  });

  const busy: BusyInterval[] = tasks
    .filter((t) => t.scheduledDate !== null)
    .map((t) => {
      const startMin = t.scheduledStartMinute ?? DAY_START_MIN;
      const dur = t.estimatedMinutes ?? DEFAULT_DURATION_MIN;
      return {
        dateISO: new Date(t.scheduledDate!).toISOString().slice(0, 10),
        startMin,
        endMin: startMin + dur,
        taskId: t.id,
      };
    });

  return findNextSlot(busy, {
    durationMin: args.durationMin,
    fromDateISO,
    horizonDays,
  });
}

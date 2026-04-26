import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  dayLabel,
  isValidDateISO,
  mondayOf,
  shiftDateISO,
  todayISO,
} from '@/lib/dates';
import WeekBoard from './WeekBoard';

export const dynamic = 'force-dynamic';

export default async function WeekBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const sp = await searchParams;
  const requested = sp?.date ?? '';
  const focus = isValidDateISO(requested) ? requested : todayISO();
  const today = todayISO();
  const weekStart = mondayOf(focus);
  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) weekDays.push(shiftDateISO(weekStart, i));

  const rangeStart = new Date(weekStart + 'T00:00:00.000Z');
  const rangeEnd = new Date(weekStart + 'T00:00:00.000Z');
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);

  const [installers, pool, scheduled] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'installer', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    prisma.task.findMany({
      where: {
        scheduledDate: null,
        status: { not: 'done' },
        project: { archivedAt: null },
      },
      orderBy: [{ projectId: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { select: { id: true, name: true, color: true, clientName: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        scheduledDate: { gte: rangeStart, lt: rangeEnd },
        assignedInstallerId: { not: null },
      },
      orderBy: [{ assignedInstallerId: 'asc' }, { scheduledDate: 'asc' }, { scheduledOrder: 'asc' }],
      include: {
        project: { select: { id: true, name: true, color: true, clientName: true } },
      },
    }),
  ]);

  const dayHeaders = weekDays.map((iso) => ({ iso, ...dayLabel(iso), isToday: iso === today }));

  return (
    <main className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-3 px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Week board</h1>
        <nav className="flex items-center gap-2 text-sm">
          <a
            href={`/board/week?date=${shiftDateISO(weekStart, -7)}`}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            ← Prev week
          </a>
          <a
            href="/board/week"
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            This week
          </a>
          <a
            href={`/board/week?date=${shiftDateISO(weekStart, 7)}`}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Next week →
          </a>
          <span className="ml-2 text-sm font-medium">
            {dayLabel(weekStart).dayNum} – {dayLabel(weekDays[6]).dayNum}
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <a href={`/board?date=${focus}`} className="underline">Day view</a>
          <a href="/projects" className="underline">Projects</a>
          <a href="/" className="underline">Home</a>
        </div>
      </header>

      <WeekBoard
        installers={installers}
        days={dayHeaders}
        initialPool={pool.map(serializeTask)}
        initialScheduled={scheduled.map(serializeTask)}
      />
    </main>
  );
}

type DbTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduledDate: Date | null;
  scheduledOrder: number | null;
  assignedInstallerId: string | null;
  project: { id: string; name: string; color: string | null; clientName: string | null };
};

function serializeTask(t: DbTask) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as 'pending' | 'in_progress' | 'done' | 'blocked',
    scheduledOrder: t.scheduledOrder,
    assignedInstallerId: t.assignedInstallerId,
    scheduledDateISO: t.scheduledDate ? new Date(t.scheduledDate).toISOString().slice(0, 10) : null,
    project: t.project,
  };
}

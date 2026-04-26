import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  dayBoundsUTC,
  humanDateLabel,
  isValidDateISO,
  shiftDateISO,
  todayISO,
} from '@/lib/dates';
import Board from './Board';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const sp = await searchParams;
  const requested = sp?.date ?? '';
  const dateISO = isValidDateISO(requested) ? requested : todayISO();
  const today = todayISO();

  const { start: dayStart, end: dayEnd } = dayBoundsUTC(dateISO);

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
        scheduledDate: { gte: dayStart, lt: dayEnd },
        assignedInstallerId: { not: null },
      },
      orderBy: [{ assignedInstallerId: 'asc' }, { scheduledStartMinute: 'asc' }, { scheduledOrder: 'asc' }],
      include: {
        project: { select: { id: true, name: true, color: true, clientName: true } },
      },
    }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
        <nav className="flex items-center gap-2 text-sm">
          <a
            href={`/board?date=${shiftDateISO(dateISO, -1)}`}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            ← Prev
          </a>
          <a
            href="/board"
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Today
          </a>
          <a
            href={`/board?date=${shiftDateISO(dateISO, 1)}`}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Next →
          </a>
          <span className="ml-2 font-medium">
            {humanDateLabel(dateISO)}
            {dateISO === today && <span className="ml-1 text-xs text-neutral-500">(today)</span>}
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <a href={`/board/week?date=${dateISO}`} className="underline">Week view</a>
          <a href="/projects" className="underline">Projects</a>
          <a href="/" className="underline">Home</a>
        </div>
      </header>

      <Board
        dateISO={dateISO}
        installers={installers}
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
  scheduledStartMinute: number | null;
  estimatedMinutes: number | null;
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
    scheduledStartMinute: t.scheduledStartMinute,
    estimatedMinutes: t.estimatedMinutes,
    assignedInstallerId: t.assignedInstallerId,
    project: t.project,
  };
}

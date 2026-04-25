import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Board from './Board';

export const dynamic = 'force-dynamic';

function todayISO(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isValidDateISO(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00.000Z').getTime());
}

function shiftDateISO(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function humanDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

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

  const dayStart = new Date(dateISO + 'T00:00:00.000Z');
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

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
      orderBy: [{ assignedInstallerId: 'asc' }, { scheduledOrder: 'asc' }],
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
    project: t.project,
  };
}

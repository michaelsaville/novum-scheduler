import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { csvResponse } from '@/lib/csv';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (session.user.role === 'installer') {
    return new Response('Forbidden', { status: 403 });
  }
  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days') ?? '28', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 28;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const installers = await prisma.user.findMany({
    where: { role: 'installer' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, active: true },
  });

  const rows: (string | number)[][] = [];
  for (const i of installers) {
    const [tasks, entries] = await Promise.all([
      prisma.task.findMany({
        where: { assignedInstallerId: i.id, scheduledDate: { gte: since } },
        select: { status: true, estimatedMinutes: true, scheduledDate: true },
      }),
      prisma.timeEntry.findMany({
        where: { userId: i.id, stoppedAt: { not: null, gte: since } },
        select: { startedAt: true, stoppedAt: true },
      }),
    ]);
    const scheduledMin = tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
    const actualMin = Math.round(
      entries.reduce(
        (s, e) => s + (e.stoppedAt ? e.stoppedAt.getTime() - e.startedAt.getTime() : 0),
        0,
      ) / 60000,
    );
    const doneTasks = tasks.filter((t) => t.status === 'done');
    const onTimeCount = doneTasks.filter(
      (t) => !t.scheduledDate || t.scheduledDate.getTime() <= Date.now(),
    ).length;
    const onTimePct = doneTasks.length > 0 ? Math.round((onTimeCount / doneTasks.length) * 100) : '';
    rows.push([
      i.name,
      i.active ? 'active' : 'inactive',
      tasks.length,
      doneTasks.length,
      onTimePct,
      scheduledMin,
      actualMin,
      actualMin - scheduledMin,
    ]);
  }

  return csvResponse(
    `installer-load-${days}d.csv`,
    [
      'installer',
      'state',
      'taskCount',
      'doneCount',
      'onTimePct',
      'scheduledMinutes',
      'actualMinutes',
      'varianceMinutes',
    ],
    rows,
  );
}

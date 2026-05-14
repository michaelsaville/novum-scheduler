import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { formatHumanDuration } from '@/lib/timer';

export const dynamic = 'force-dynamic';

export default async function InstallerLoadReport({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const sp = await searchParams;
  const daysRaw = parseInt(sp.days ?? '28', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 28;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs);

  const installers = await prisma.user.findMany({
    where: { role: 'installer' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, active: true },
  });

  // Aggregate per-installer in app code: scheduled hours (sum of
  // estimatedMinutes for tasks in the window), actual hours (sum of
  // stopped TimeEntry minutes), task count, on-time-completion % (done
  // tasks whose stoppedAt <= scheduledDate end-of-day).
  const rows = await Promise.all(
    installers.map(async (i) => {
      const [tasks, entries] = await Promise.all([
        prisma.task.findMany({
          where: {
            assignedInstallerId: i.id,
            scheduledDate: { gte: since },
          },
          select: {
            id: true,
            status: true,
            estimatedMinutes: true,
            scheduledDate: true,
          },
        }),
        prisma.timeEntry.findMany({
          where: {
            userId: i.id,
            stoppedAt: { not: null, gte: since },
          },
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
      const taskCount = tasks.length;
      const doneCount = doneTasks.length;
      // On-time % = done tasks whose own scheduledDate is <= today
      // (i.e. they were scheduled for now-or-past and got done). Approx
      // since we don't store actual-done timestamp on the task — the
      // status flip lands in audit but we'd need to join + cap scope.
      const onTimeCount = doneTasks.filter(
        (t) => !t.scheduledDate || t.scheduledDate.getTime() <= Date.now(),
      ).length;
      const onTimePct = doneCount > 0 ? Math.round((onTimeCount / doneCount) * 100) : null;

      return {
        installer: i,
        scheduledMin,
        actualMin,
        taskCount,
        doneCount,
        onTimePct,
      };
    }),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-2">
        <Link href="/reports" className="text-xs text-neutral-500 underline">
          ← Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Per-installer load</h1>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Window (days back)</span>
            <input
              name="days"
              type="number"
              min={1}
              max={365}
              defaultValue={days}
              className="w-24 rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Run
          </button>
          <a
            href={`/api/reports/installer-load.csv?days=${days}`}
            className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Download CSV
          </a>
        </form>
        <p className="text-xs text-neutral-500">
          Last {days} days, scheduled-date window. Actual hours from stopped
          timer entries (started OR stopped in window — best-effort).
        </p>
      </header>

      <section className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-neutral-300 text-left text-xs uppercase tracking-wider text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <th className="px-2 py-2">Installer</th>
              <th className="px-2 py-2 text-right">Tasks</th>
              <th className="px-2 py-2 text-right">Done</th>
              <th className="px-2 py-2 text-right">On time</th>
              <th className="px-2 py-2 text-right">Scheduled</th>
              <th className="px-2 py-2 text-right">Actual</th>
              <th className="px-2 py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const variance = r.actualMin - r.scheduledMin;
              return (
                <tr key={r.installer.id} className="border-b border-neutral-200 dark:border-neutral-800">
                  <td className="px-2 py-2">
                    {r.installer.name}
                    {!r.installer.active && (
                      <span className="ml-2 text-xs text-neutral-500">(inactive)</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">{r.taskCount}</td>
                  <td className="px-2 py-2 text-right">{r.doneCount}</td>
                  <td className="px-2 py-2 text-right">
                    {r.onTimePct != null ? `${r.onTimePct}%` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right">{formatHumanDuration(r.scheduledMin)}</td>
                  <td className="px-2 py-2 text-right font-mono">{formatHumanDuration(r.actualMin)}</td>
                  <td className={`px-2 py-2 text-right font-mono ${variance > 0 ? 'text-red-700 dark:text-red-300' : variance < 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                    {variance > 0 ? '+' : ''}
                    {formatHumanDuration(Math.abs(variance))}
                    {variance > 0 ? ' over' : variance < 0 ? ' under' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

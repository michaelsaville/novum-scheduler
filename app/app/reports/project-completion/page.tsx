import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { humanDateLabel } from '@/lib/dates';
import { formatHumanDuration } from '@/lib/timer';

export const dynamic = 'force-dynamic';

export default async function ProjectCompletionReport({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const sp = await searchParams;
  const projectId = sp.projectId ?? '';

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, clientName: true },
  });

  const project = projectId
    ? await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, clientName: true },
      })
    : null;

  const tasks = project
    ? await prisma.task.findMany({
        where: { projectId: project.id },
        orderBy: [{ status: 'asc' }, { scheduledDate: 'asc' }],
        include: {
          installer: { select: { name: true } },
          _count: { select: { notes: true } },
          timeEntries: { select: { startedAt: true, stoppedAt: true } },
        },
      })
    : [];

  // Sum each task's stopped time entries to derive actualMinutes.
  // Cheaper to compute here than to maintain a denormalized column.
  const taskRows = tasks.map((t) => {
    const actualMs = t.timeEntries.reduce(
      (sum, e) =>
        sum + (e.stoppedAt ? e.stoppedAt.getTime() - e.startedAt.getTime() : 0),
      0,
    );
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      scheduledDate: t.scheduledDate,
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: Math.round(actualMs / 60000),
      installerName: t.installer?.name ?? '—',
      noteCount: t._count.notes,
    };
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-2">
        <Link href="/reports" className="text-xs text-neutral-500 underline">
          ← Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Per-project completion
        </h1>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Project</span>
            <select
              name="projectId"
              defaultValue={projectId}
              className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <option value="">— pick a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.clientName ? ` · ${p.clientName}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Run
          </button>
          {project && (
            <a
              href={`/api/reports/project-completion.csv?projectId=${project.id}`}
              className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Download CSV
            </a>
          )}
        </form>
      </header>

      {!project ? (
        <p className="text-sm text-neutral-500">Pick a project above to run the report.</p>
      ) : taskRows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No tasks on {project.name}.
        </p>
      ) : (
        <section className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-300 text-left text-xs uppercase tracking-wider text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                <th className="px-2 py-2">Task</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Scheduled</th>
                <th className="px-2 py-2">Installer</th>
                <th className="px-2 py-2 text-right">Estimate</th>
                <th className="px-2 py-2 text-right">Actual</th>
                <th className="px-2 py-2 text-right">Notes</th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((t) => {
                const dateISO = t.scheduledDate
                  ? new Date(t.scheduledDate).toISOString().slice(0, 10)
                  : null;
                return (
                  <tr key={t.id} className="border-b border-neutral-200 dark:border-neutral-800">
                    <td className="px-2 py-2">
                      <Link href={`/tasks/${t.id}`} className="hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-xs uppercase tracking-wider text-neutral-600">{t.status.replace('_', ' ')}</td>
                    <td className="px-2 py-2 text-xs text-neutral-500">
                      {dateISO ? humanDateLabel(dateISO) : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs">{t.installerName}</td>
                    <td className="px-2 py-2 text-right text-xs">
                      {t.estimatedMinutes != null ? formatHumanDuration(t.estimatedMinutes) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-mono">
                      {t.actualMinutes > 0 ? formatHumanDuration(t.actualMinutes) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-xs">{t.noteCount}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-300 text-xs font-semibold dark:border-neutral-700">
                <td className="px-2 py-2" colSpan={4}>
                  Totals · {taskRows.length} task{taskRows.length === 1 ? '' : 's'}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatHumanDuration(
                    taskRows.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
                  )}
                </td>
                <td className="px-2 py-2 text-right font-mono">
                  {formatHumanDuration(taskRows.reduce((s, t) => s + t.actualMinutes, 0))}
                </td>
                <td className="px-2 py-2 text-right">
                  {taskRows.reduce((s, t) => s + t.noteCount, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </main>
  );
}

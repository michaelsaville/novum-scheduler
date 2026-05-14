import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { BUSINESS_TIMEZONE } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function DeficiencyAgingReport() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const open = await prisma.deficiency.findMany({
    where: { status: 'open' },
    // Soonest-due first, treating null as "no target" (sorted to end).
    orderBy: [{ dueBy: 'asc' }, { createdAt: 'asc' }],
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { name: true, clientName: true } },
        },
      },
      raisedBy: { select: { name: true } },
    },
  });

  const now = Date.now();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-2">
        <Link href="/reports" className="text-xs text-neutral-500 underline">
          ← Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Open-deficiency aging</h1>
        <div className="flex items-center gap-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {open.length} open · soonest-due first
          </p>
          <a
            href="/api/reports/deficiency-aging.csv"
            className="ml-auto rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Download CSV
          </a>
        </div>
      </header>

      {open.length === 0 ? (
        <p className="text-sm text-neutral-500">No open deficiencies. ✓</p>
      ) : (
        <section className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-300 text-left text-xs uppercase tracking-wider text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                <th className="px-2 py-2">Severity</th>
                <th className="px-2 py-2">Project</th>
                <th className="px-2 py-2">Task</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Raised by</th>
                <th className="px-2 py-2">Due</th>
                <th className="px-2 py-2 text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              {open.map((d) => {
                const ageDays = Math.floor((now - d.createdAt.getTime()) / (24 * 60 * 60 * 1000));
                const overdue = d.dueBy ? d.dueBy.getTime() < now : false;
                const dueLabel = d.dueBy
                  ? new Date(d.dueBy).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: BUSINESS_TIMEZONE,
                    })
                  : '—';
                return (
                  <tr
                    key={d.id}
                    className={`border-b border-neutral-200 dark:border-neutral-800 ${
                      overdue ? 'bg-red-50 dark:bg-red-950/20' : ''
                    }`}
                  >
                    <td className="px-2 py-2">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider ${
                          d.severity === 'safety'
                            ? 'text-red-700 dark:text-red-300'
                            : d.severity === 'functional'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-neutral-500'
                        }`}
                      >
                        {d.severity}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {d.task.project.name}
                      {d.task.project.clientName ? ` · ${d.task.project.clientName}` : ''}
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/tasks/${d.task.id}`} className="text-sm hover:underline">
                        {d.task.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2 max-w-md text-xs">{d.description}</td>
                    <td className="px-2 py-2 text-xs">{d.raisedBy.name}</td>
                    <td className={`px-2 py-2 text-xs ${overdue ? 'font-semibold text-red-700 dark:text-red-300' : ''}`}>
                      {dueLabel}
                      {overdue && ' · overdue'}
                    </td>
                    <td className="px-2 py-2 text-right text-xs">{ageDays}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

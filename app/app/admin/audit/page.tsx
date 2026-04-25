import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { describeAuditEvent, type AuditAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; user?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const sp = await searchParams;
  const entityFilter = sp?.entity?.trim();
  const userFilter = sp?.user?.trim();

  const where: Parameters<typeof prisma.auditLog.findMany>[0] extends infer T
    ? T extends { where?: infer W }
      ? W
      : never
    : never = {};
  if (entityFilter && ['task', 'project', 'user', 'note'].includes(entityFilter)) {
    where.entityType = entityFilter;
  }
  if (userFilter) {
    where.userId = userFilter;
  }

  const events = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, name: true, username: true } } },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Last {events.length} events. Admin only.
          </p>
        </div>
        <a href="/" className="text-sm underline">← Home</a>
      </header>

      <nav className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500">Filter:</span>
        <a href="/admin/audit" className={!entityFilter ? 'rounded bg-neutral-900 px-2 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700'}>
          All
        </a>
        {(['task', 'project', 'user', 'note'] as const).map((e) => (
          <a
            key={e}
            href={`/admin/audit?entity=${e}`}
            className={entityFilter === e ? 'rounded bg-neutral-900 px-2 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700'}
          >
            {e}
          </a>
        ))}
      </nav>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No events match.</p>
      ) : (
        <ol className="divide-y divide-neutral-200 rounded border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-3 py-2">
              <span className="whitespace-nowrap text-xs text-neutral-500">
                {formatDateTime(e.createdAt)}
              </span>
              <span>
                <strong>{e.user.name}</strong>{' '}
                <span className="text-neutral-600 dark:text-neutral-400">
                  {describeAuditEvent(e.action as AuditAction, e.metadata as Record<string, unknown> | null)}
                </span>{' '}
                <span className="text-xs text-neutral-500">
                  on {e.entityType}
                </span>
              </span>
              {e.entityType === 'task' && (
                <a href={`/tasks/${e.entityId}`} className="text-xs underline">view</a>
              )}
              {e.entityType === 'project' && (
                <a href={`/projects/${e.entityId}`} className="text-xs underline">view</a>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

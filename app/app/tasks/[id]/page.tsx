import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { setTaskStatus } from '@/app/tasks/actions';
import { describeAuditEvent, type AuditAction } from '@/lib/audit';
import { formatTime, formatDuration } from '@/lib/time';
import AddNoteForm from './AddNoteForm';
import ScheduleNextButton from './ScheduleNextButton';

export const dynamic = 'force-dynamic';

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatScheduledDate(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, color: true, clientName: true } },
      installer: { select: { id: true, name: true, color: true } },
      notes: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, username: true } },
          photos: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, width: true, height: true },
          },
        },
      },
    },
  });

  if (!task) notFound();

  // Audit timeline for this task. Notes are already a section above so
  // we filter note.create out to avoid duplication.
  const auditEvents = await prisma.auditLog.findMany({
    where: { entityType: 'task', entityId: id, action: { not: 'note.create' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { name: true } } },
  });

  const role = session.user.role;
  const isAssigned = task.assignedInstallerId === session.user.id;

  // Installers may only view their own assigned tasks.
  if (role === 'installer' && !isAssigned) {
    redirect('/me');
  }

  const canPostNote = role === 'admin' || role === 'scheduler' || isAssigned;
  const canSchedule = role === 'admin' || role === 'scheduler';
  const scheduledLabel = formatScheduledDate(task.scheduledDate);

  const installers = canSchedule
    ? await prisma.user.findMany({
        where: { role: 'installer', active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, color: true },
      })
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {task.project.color && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />
          )}
          <a href={`/projects/${task.project.id}`} className="truncate underline-offset-2 hover:underline">
            {task.project.name}
            {task.project.clientName ? ` · ${task.project.clientName}` : ''}
          </a>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        {task.description && (
          <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          <StatusPill status={task.status as 'pending' | 'in_progress' | 'done' | 'blocked'} />
          {scheduledLabel ? (
            <span>📅 {scheduledLabel}</span>
          ) : (
            <span>📥 in pool</span>
          )}
          {task.scheduledStartMinute !== null && <span>🕒 {formatTime(task.scheduledStartMinute)}</span>}
          {task.estimatedMinutes !== null && <span>⏱ {formatDuration(task.estimatedMinutes)}</span>}
          {task.installer ? (
            <span className="flex items-center gap-1">
              {task.installer.color && (
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: task.installer.color }} />
              )}
              {task.installer.name}
            </span>
          ) : (
            <span>unassigned</span>
          )}
        </div>
        {canPostNote && (
          <form action={setTaskStatus} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="taskId" value={task.id} />
            {(['pending', 'in_progress', 'done', 'blocked'] as const).map((s) => (
              <button
                key={s}
                type="submit"
                name="status"
                value={s}
                disabled={task.status === s}
                className={`rounded px-2.5 py-1 text-xs disabled:cursor-default ${
                  task.status === s
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </form>
        )}
        <div className="mt-1 text-xs">
          <a href={role === 'installer' ? '/me' : `/projects/${task.project.id}`} className="underline">
            ← Back to {role === 'installer' ? 'today' : 'project'}
          </a>
        </div>
      </header>

      {canSchedule && task.status !== 'done' && (
        <ScheduleNextButton
          taskId={task.id}
          estimatedMinutes={task.estimatedMinutes}
          currentInstallerId={task.assignedInstallerId}
          installers={installers}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          Notes ({task.notes.length})
        </h2>

        {task.notes.length === 0 ? (
          <p className="text-sm text-neutral-500">No notes yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {task.notes.map((n) => (
              <li
                key={n.id}
                className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{n.user.name}</span>
                  <span className="text-xs text-neutral-500">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                {n.body && <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>}
                {n.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {n.photos.map((p) => (
                      <a
                        key={p.id}
                        href={`/api/photos/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/photos/${p.id}`}
                          alt=""
                          loading="lazy"
                          width={p.width}
                          height={p.height}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {canPostNote ? (
          <AddNoteForm taskId={task.id} />
        ) : (
          <p className="text-xs text-neutral-500">
            Only the assigned installer or a scheduler can post notes here.
          </p>
        )}
      </section>

      {auditEvents.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Activity</h2>
          <ol className="divide-y divide-neutral-200 rounded border border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
            {auditEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2">
                <span className="text-xs text-neutral-500 whitespace-nowrap">
                  {formatDateTime(e.createdAt)}
                </span>
                <span>
                  <strong>{e.user.name}</strong>{' '}
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {describeAuditEvent(e.action as AuditAction, e.metadata as Record<string, unknown> | null)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function StatusPill({ status }: { status: 'pending' | 'in_progress' | 'done' | 'blocked' }) {
  const map: Record<string, string> = {
    pending: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

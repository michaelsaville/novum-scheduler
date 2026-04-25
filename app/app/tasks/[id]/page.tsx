import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import AddNoteForm from './AddNoteForm';

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
        },
      },
    },
  });

  if (!task) notFound();

  const role = session.user.role;
  const isAssigned = task.assignedInstallerId === session.user.id;

  // Installers may only view their own assigned tasks.
  if (role === 'installer' && !isAssigned) {
    redirect('/me');
  }

  const canPostNote = role === 'admin' || role === 'scheduler' || isAssigned;
  const scheduledLabel = formatScheduledDate(task.scheduledDate);

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
        <div className="mt-1 text-xs">
          <a href={role === 'installer' ? '/me' : `/projects/${task.project.id}`} className="underline">
            ← Back to {role === 'installer' ? 'today' : 'project'}
          </a>
        </div>
      </header>

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
                <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
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

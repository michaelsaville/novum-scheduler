import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import { setTaskStatus } from '@/app/tasks/actions';
import { dayBoundsUTC, todayISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const { start, end } = dayBoundsUTC(todayISO());

  const [today, upcoming, pool] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignedInstallerId: userId,
        scheduledDate: { gte: start, lt: end },
      },
      include: {
        project: { select: { name: true, color: true, clientName: true } },
        _count: { select: { notes: true } },
      },
      orderBy: [{ status: 'asc' }, { scheduledOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.task.findMany({
      where: {
        assignedInstallerId: userId,
        scheduledDate: { gte: end },
        status: { not: 'done' },
      },
      include: {
        project: { select: { name: true, color: true, clientName: true } },
        _count: { select: { notes: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledOrder: 'asc' }],
      take: 20,
    }),
    prisma.task.findMany({
      where: {
        assignedInstallerId: userId,
        scheduledDate: null,
        status: { not: 'done' },
      },
      include: {
        project: { select: { name: true, color: true, clientName: true } },
        _count: { select: { notes: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ]);

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-24">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {session.user.name} · {start.toDateString()}
          </p>
        </header>

        <Section title={`Today (${today.length})`} emptyText="Nothing scheduled for today.">
          {today.map((t) => <TaskCard key={t.id} task={t} showQuickActions />)}
        </Section>

        <Section title={`Coming up (${upcoming.length})`} emptyText="No upcoming work.">
          {upcoming.map((t) => <TaskCard key={t.id} task={t} showDate />)}
        </Section>

        {pool.length > 0 && (
          <Section title={`Assigned but not yet dated (${pool.length})`}>
            {pool.map((t) => <TaskCard key={t.id} task={t} />)}
          </Section>
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch border-t border-neutral-200 bg-white/95 backdrop-blur supports-[padding:max(0px)]:pb-[env(safe-area-inset-bottom)] dark:border-neutral-800 dark:bg-neutral-950/95"
        aria-label="Primary"
      >
        <a href="/me" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-sm font-medium">
          <span aria-hidden>📋</span>
          <span>Today</span>
        </a>
        <a href="/account" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-sm">
          <span aria-hidden>👤</span>
          <span>Account</span>
        </a>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
          className="flex flex-1"
        >
          <button
            type="submit"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-sm text-neutral-500"
          >
            <span aria-hidden>↩</span>
            <span>Sign out</span>
          </button>
        </form>
      </nav>
    </>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText?: string;
  children: React.ReactNode;
}) {
  const isEmpty = Array.isArray(children) && children.length === 0;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {isEmpty && emptyText ? (
        <p className="text-sm text-neutral-500">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  );
}

type TaskCardProps = {
  task: {
    id: string;
    title: string;
    description: string | null;
    scheduledDate: Date | null;
    status: string;
    project: { name: string; color: string | null; clientName: string | null };
    _count: { notes: number };
  };
  showDate?: boolean;
  showQuickActions?: boolean;
};

function TaskCard({ task, showDate, showQuickActions }: TaskCardProps) {
  const dateLabel = task.scheduledDate
    ? new Date(task.scheduledDate).toISOString().slice(0, 10)
    : null;
  const isDone = task.status === 'done';

  return (
    <article
      className={`rounded border bg-white dark:bg-neutral-900 ${
        isDone
          ? 'border-neutral-200 opacity-60 dark:border-neutral-800'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <a href={`/tasks/${task.id}`} className="block p-3">
        <div className="flex items-center gap-2">
          {task.project.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />}
          <span className="text-xs text-neutral-500 truncate">
            {task.project.name}{task.project.clientName ? ` · ${task.project.clientName}` : ''}
          </span>
          {showDate && dateLabel && <span className="ml-auto text-xs text-neutral-500">{dateLabel}</span>}
        </div>
        <h3 className={`mt-1 font-medium ${isDone ? 'line-through' : ''}`}>{task.title}</h3>
        {task.description && (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
            {task.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
          {task._count.notes > 0 && <span>💬 {task._count.notes}</span>}
          {task.status === 'in_progress' && <span className="text-blue-700 dark:text-blue-300">▶ in progress</span>}
          {task.status === 'blocked' && <span className="text-red-700 dark:text-red-300">⏸ blocked</span>}
          {task.status === 'done' && <span>✓ done</span>}
        </div>
      </a>
      {showQuickActions && (
        <div className="flex gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
          {task.status === 'pending' && (
            <StatusButton taskId={task.id} status="in_progress" label="Start →" primary />
          )}
          {task.status === 'in_progress' && (
            <StatusButton taskId={task.id} status="done" label="✓ Mark done" primary />
          )}
          {task.status === 'done' && (
            <StatusButton taskId={task.id} status="in_progress" label="Reopen" />
          )}
          {task.status !== 'done' && task.status !== 'blocked' && (
            <StatusButton taskId={task.id} status="blocked" label="⏸ Blocked" />
          )}
          {task.status === 'blocked' && (
            <StatusButton taskId={task.id} status="in_progress" label="Resume" />
          )}
        </div>
      )}
    </article>
  );
}

function StatusButton({
  taskId,
  status,
  label,
  primary = false,
}: {
  taskId: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={setTaskStatus} className="inline">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={
          primary
            ? 'rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white'
            : 'rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
        }
      >
        {label}
      </button>
    </form>
  );
}

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { setTaskStatus, startTaskTimer, stopTaskTimer } from '@/app/tasks/actions';
import { dayBoundsUTC, todayISO } from '@/lib/dates';
import { formatTime, formatDuration } from '@/lib/time';
import { getRunningTimer } from '@/lib/timer';
import { RunningTimerBar } from '@/app/components/RunningTimerBar';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const { start, end } = dayBoundsUTC(todayISO());

  const [today, upcoming, pool, running] = await Promise.all([
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
    getRunningTimer(userId),
  ]);
  const runningTaskId = running?.taskId ?? null;

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-24">
        {running && (
          <RunningTimerBar
            taskId={running.taskId}
            taskTitle={running.task.title}
            projectName={running.task.project.name}
            projectColor={running.task.project.color}
            startedAtMs={running.startedAt.getTime()}
          />
        )}
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {session.user.name} · {start.toDateString()}
          </p>
        </header>

        <Section title={`Today (${today.length})`} emptyText="Nothing scheduled for today.">
          {today.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              showQuickActions
              isTimerRunning={runningTaskId === t.id}
            />
          ))}
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
        {/* Sign-out moved into /account behind a confirm — too dangerous
            to live one accidental thumb-tap from every screen on a
            field-tech PWA where session-loss strands the user. UX
            Review §4. */}
        <a href="/me" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-sm font-medium">
          <span aria-hidden>📋</span>
          <span>Today</span>
        </a>
        <a href="/account" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-sm">
          <span aria-hidden>👤</span>
          <span>Account</span>
        </a>
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
    scheduledStartMinute: number | null;
    estimatedMinutes: number | null;
    status: string;
    project: { name: string; color: string | null; clientName: string | null };
    _count: { notes: number };
  };
  showDate?: boolean;
  showQuickActions?: boolean;
  /** True when this card's task is the user's currently-running timer. */
  isTimerRunning?: boolean;
};

function TaskCard({ task, showDate, showQuickActions, isTimerRunning }: TaskCardProps) {
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
        {(task.scheduledStartMinute !== null || task.estimatedMinutes !== null) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
            {task.scheduledStartMinute !== null && <span>🕒 {formatTime(task.scheduledStartMinute)}</span>}
            {task.estimatedMinutes !== null && <span>⏱ {formatDuration(task.estimatedMinutes)}</span>}
          </div>
        )}
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
        // Stack: primary CTA full-width 56px (gloved-finger reachable),
        // secondaries collapsed into a small text-link row below. Per
        // UX Review §3 — the primary action should dominate.
        <div className="flex flex-col gap-1 border-t border-neutral-200 p-3 dark:border-neutral-800">
          {task.status === 'pending' && (
            <TimerButton taskId={task.id} action="start" label="▶ Start timer" primary />
          )}
          {task.status === 'in_progress' && isTimerRunning && (
            <TimerButton taskId={task.id} action="stop" label="■ Stop timer" primary />
          )}
          {task.status === 'in_progress' && !isTimerRunning && (
            <TimerButton taskId={task.id} action="start" label="▶ Resume timer" primary />
          )}
          {task.status === 'done' && (
            <StatusButton taskId={task.id} status="in_progress" label="Reopen" primary />
          )}
          {task.status === 'blocked' && (
            <TimerButton taskId={task.id} action="start" label="▶ Resume timer" primary />
          )}

          <div className="mt-1 flex items-center justify-center gap-4 text-sm text-neutral-500">
            {task.status === 'in_progress' && (
              <StatusButton taskId={task.id} status="done" label="Mark done" link />
            )}
            {task.status !== 'done' && task.status !== 'blocked' && (
              <StatusButton taskId={task.id} status="blocked" label="Mark blocked" link />
            )}
            {task.status === 'blocked' && (
              <StatusButton taskId={task.id} status="pending" label="Unblock" link />
            )}
          </div>
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
  link = false,
}: {
  taskId: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  label: string;
  primary?: boolean;
  link?: boolean;
}) {
  return (
    <form action={setTaskStatus} className={link ? 'inline' : 'flex'}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={
          link
            ? 'text-sm text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:hover:text-neutral-200'
            : primary
              ? 'flex w-full min-h-[56px] items-center justify-center rounded bg-neutral-900 px-4 py-3 text-base font-semibold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white'
              : 'flex w-full min-h-[56px] items-center justify-center rounded border border-neutral-300 px-4 py-3 text-base hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
        }
      >
        {label}
      </button>
    </form>
  );
}

function TimerButton({
  taskId,
  action,
  label,
  primary = false,
}: {
  taskId: string;
  action: 'start' | 'stop';
  label: string;
  primary?: boolean;
}) {
  const formAction = action === 'start' ? startTaskTimer : stopTaskTimer;
  return (
    <form action={formAction} className="flex">
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        className={
          primary
            ? 'flex w-full min-h-[56px] items-center justify-center rounded bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-800'
            : 'flex w-full min-h-[56px] items-center justify-center rounded border border-neutral-300 px-4 py-3 text-base hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
        }
      >
        {label}
      </button>
    </form>
  );
}

import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function todayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export default async function MePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const { start, end } = todayBounds();

  const [today, upcoming, pool] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignedInstallerId: userId,
        scheduledDate: { gte: start, lt: end },
        status: { not: 'done' },
      },
      include: {
        project: { select: { name: true, color: true, clientName: true } },
        _count: { select: { notes: true } },
      },
      orderBy: [{ scheduledOrder: 'asc' }, { createdAt: 'asc' }],
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
          {today.map((t) => <TaskCard key={t.id} task={t} />)}
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
};

function TaskCard({ task, showDate }: TaskCardProps) {
  const dateLabel = task.scheduledDate
    ? new Date(task.scheduledDate).toISOString().slice(0, 10)
    : null;
  return (
    <a
      href={`/tasks/${task.id}`}
      className="block rounded border border-neutral-200 bg-white p-3 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
    >
      <div className="flex items-center gap-2">
        {task.project.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />}
        <span className="text-xs text-neutral-500">
          {task.project.name}{task.project.clientName ? ` · ${task.project.clientName}` : ''}
        </span>
        {showDate && dateLabel && <span className="ml-auto text-xs text-neutral-500">{dateLabel}</span>}
      </div>
      <h3 className="mt-1 font-medium">{task.title}</h3>
      {task.description && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
          {task.description}
        </p>
      )}
      {task._count.notes > 0 && (
        <p className="mt-1 text-xs text-neutral-500">💬 {task._count.notes} note{task._count.notes === 1 ? '' : 's'}</p>
      )}
    </a>
  );
}

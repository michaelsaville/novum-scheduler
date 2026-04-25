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
      include: { project: { select: { name: true, color: true, clientName: true } } },
      orderBy: [{ scheduledOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.task.findMany({
      where: {
        assignedInstallerId: userId,
        scheduledDate: { gte: end },
        status: { not: 'done' },
      },
      include: { project: { select: { name: true, color: true, clientName: true } } },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledOrder: 'asc' }],
      take: 20,
    }),
    prisma.task.findMany({
      where: {
        assignedInstallerId: userId,
        scheduledDate: null,
        status: { not: 'done' },
      },
      include: { project: { select: { name: true, color: true, clientName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {session.user.name} · {start.toDateString()}
          </p>
        </div>
        <a href="/account" className="text-sm underline">account</a>
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

      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button type="submit" className="text-xs text-neutral-500 underline hover:text-neutral-700">
          Sign out
        </button>
      </form>
    </main>
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
  };
  showDate?: boolean;
};

function TaskCard({ task, showDate }: TaskCardProps) {
  const dateLabel = task.scheduledDate
    ? new Date(task.scheduledDate).toISOString().slice(0, 10)
    : null;
  return (
    <article className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
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
    </article>
  );
}

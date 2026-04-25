import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import CreateProjectForm from './CreateProjectForm';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const projects = await prisma.project.findMany({
    orderBy: [{ archivedAt: 'asc' }, { status: 'asc' }, { updatedAt: 'desc' }],
    include: { _count: { select: { tasks: true } } },
  });

  const active = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Create projects, then add tasks. Tasks scheduled to installers come in Sprint 2 (board).
          </p>
        </div>
        <a href="/" className="text-sm underline">← Home</a>
      </header>

      <CreateProjectForm />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Active ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-neutral-500">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {active.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  {p.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />}
                  <div className="min-w-0">
                    <a href={`/projects/${p.id}`} className="block truncate font-medium underline-offset-2 hover:underline">
                      {p.name}
                    </a>
                    <div className="truncate text-xs text-neutral-500">
                      {p.clientName ? `${p.clientName} · ` : ''}{p._count.tasks} task{p._count.tasks === 1 ? '' : 's'} · {p.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                <a href={`/projects/${p.id}`} className="shrink-0 text-xs underline">open</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium text-neutral-500">Archived ({archived.length})</h2>
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 opacity-60 dark:divide-neutral-800 dark:border-neutral-800">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <a href={`/projects/${p.id}`} className="truncate text-sm">{p.name}</a>
                <span className="text-xs text-neutral-500">{p._count.tasks} tasks</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { archiveProject } from '../actions';
import EditProjectForm from './EditProjectForm';
import CreateTaskForm from './CreateTaskForm';
import TaskRow from './TaskRow';
import DeleteProjectButton from './DeleteProjectButton';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const { id } = await params;

  const [project, installers] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: [{ status: 'asc' }, { scheduledDate: 'asc' }, { createdAt: 'desc' }],
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'installer', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
  ]);

  if (!project) notFound();

  const pool = project.tasks.filter((t) => !t.scheduledDate);
  const scheduled = project.tasks.filter((t) => t.scheduledDate);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {project.color && <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />}
          <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.archivedAt && <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">archived</span>}
        </div>
        <a href="/projects" className="shrink-0 text-sm underline">← All projects</a>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Project details</h2>
        <EditProjectForm
          project={{
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            color: project.color,
            status: project.status,
            clientEmail: project.clientEmail,
            notifyClient: project.notifyClient,
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <form action={archiveProject}>
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="archive" value={project.archivedAt ? 'false' : 'true'} />
            <button
              type="submit"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {project.archivedAt ? 'Unarchive' : 'Archive project'}
            </button>
          </form>
          <DeleteProjectButton
            id={project.id}
            name={project.name}
            taskCount={project.tasks.length}
          />
          <p className="ml-auto text-xs text-neutral-500">
            Archive hides the project from the active list. Delete removes it and all its tasks/notes/photos.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Tasks ({project.tasks.length})</h2>
        <CreateTaskForm projectId={project.id} />

        <div>
          <h3 className="mt-4 mb-1 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            In pool ({pool.length}) — not yet scheduled
          </h3>
          {pool.length === 0 ? (
            <p className="text-sm text-neutral-500">No unscheduled tasks.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {pool.map((t) => (
                <TaskRow key={t.id} task={t} installers={installers} />
              ))}
            </ul>
          )}
        </div>

        {scheduled.length > 0 && (
          <div>
            <h3 className="mt-4 mb-1 text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Scheduled ({scheduled.length})
            </h3>
            <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {scheduled.map((t) => (
                <TaskRow key={t.id} task={t} installers={installers} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

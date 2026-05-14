import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import NewTemplateForm from './NewTemplateForm';
import { deleteChecklistTemplate, type ChecklistTemplateItem } from './actions';

export const dynamic = 'force-dynamic';

export default async function ChecklistsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const templates = await prisma.checklistTemplate.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { taskChecklists: true } } },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header>
        <a href="/admin" className="text-xs text-neutral-500 underline">
          ← Admin
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Checklist templates
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Per-project-type checklists applied to tasks (pre-arrival, on-site,
          clean-up, sign-off). Required items block task close-out.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Existing</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-neutral-500">No templates yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {templates.map((t) => {
              const items = t.items as unknown as ChecklistTemplateItem[];
              return (
                <li
                  key={t.id}
                  className={`rounded border p-3 ${
                    t.active
                      ? 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                      : 'border-neutral-300 bg-neutral-100 opacity-70 dark:border-neutral-700 dark:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold">{t.name}</h3>
                    {!t.active && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                        retired
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {t.description}
                    </p>
                  )}
                  <ol className="mt-2 list-decimal pl-5 text-sm">
                    {items.map((it) => (
                      <li key={it.id}>
                        {it.label}{' '}
                        {it.required && (
                          <span className="text-xs text-red-700 dark:text-red-300">
                            (required)
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-neutral-500">
                    Applied to {t._count.taskChecklists}{' '}
                    {t._count.taskChecklists === 1 ? 'task' : 'tasks'}
                  </p>
                  <form action={deleteChecklistTemplate} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                    >
                      {t._count.taskChecklists > 0 ? 'Retire' : 'Delete'}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">New template</h2>
        <NewTemplateForm />
      </section>
    </main>
  );
}

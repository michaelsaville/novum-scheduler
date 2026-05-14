import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ReportsIndex() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const reports = [
    {
      href: '/reports/project-completion',
      title: 'Per-project completion',
      desc: 'Task list per project with status, scheduled date, actual minutes, photo count.',
    },
    {
      href: '/reports/installer-load',
      title: 'Per-installer load',
      desc: 'Hours scheduled vs actual + task count + on-time-completion % over a date range.',
    },
    {
      href: '/reports/deficiency-aging',
      title: 'Open-deficiency aging',
      desc: 'Every open punch-list item by due date — your Monday-morning catch-up screen.',
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Each report renders as a server-rendered HTML table; the
          download link returns CSV. Print-to-PDF from the browser
          for a static snapshot.
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {reports.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="block rounded border border-neutral-200 bg-white p-3 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
            >
              <h2 className="font-medium">{r.title}</h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {r.desc}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

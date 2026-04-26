import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import AccountForm from './AccountForm';
import PushOptIn from './PushOptIn';
import { rotateIcsToken } from './actions';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { icsToken: true },
  });

  const origin = process.env.PUBLIC_ORIGIN ?? 'https://novum.pcc2k.com';
  const icsUrl = me?.icsToken ? `${origin}/api/ics/${me.icsToken}` : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Signed in as <strong>{session.user.name}</strong> ({session.user.username} · {session.user.role}).
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Change password</h2>
        <AccountForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Push notifications</h2>
        <PushOptIn vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Calendar feed</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Subscribe to your scheduled tasks in any calendar app (iPhone Calendar, Google
          Calendar, Outlook). Updates appear as the scheduler assigns work.
        </p>
        {icsUrl ? (
          <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <code className="break-all rounded bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">
              {icsUrl}
            </code>
            <p className="text-xs text-neutral-500">
              Treat this URL like a password — anyone with it can read your schedule.
            </p>
            <div className="flex gap-2">
              <form action={rotateIcsToken} className="inline">
                <input type="hidden" name="intent" value="rotate" />
                <button
                  type="submit"
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Rotate (invalidates old URL)
                </button>
              </form>
              <form action={rotateIcsToken} className="inline">
                <input type="hidden" name="intent" value="revoke" />
                <button
                  type="submit"
                  className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Revoke
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={rotateIcsToken} className="inline-block">
            <input type="hidden" name="intent" value="rotate" />
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              Generate calendar URL
            </button>
          </form>
        )}
      </section>

      <a className="text-sm text-neutral-500 underline hover:text-neutral-700" href="/">
        ← Back to home
      </a>
    </main>
  );
}

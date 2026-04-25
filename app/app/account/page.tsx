import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AccountForm from './AccountForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

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
      <a className="text-sm text-neutral-500 underline hover:text-neutral-700" href="/">
        ← Back to home
      </a>
    </main>
  );
}

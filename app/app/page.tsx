import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;

  // Installers go straight to their personal task list.
  if (role === 'installer') redirect('/me');

  // Admin + scheduler land on the board.
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Novum Scheduler</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Welcome, {session.user.name} ({role}).
      </p>
      <nav className="flex flex-col gap-1 text-sm">
        <a className="underline" href="/board">Board · day view</a>
        <a className="underline" href="/board/week">Board · week view</a>
        <a className="underline" href="/projects">Projects</a>
        {role === 'admin' && <a className="underline" href="/admin/users">Admin · Users</a>}
        {role === 'admin' && <a className="underline" href="/admin/audit">Admin · Audit log</a>}
        <a className="underline" href="/account">Account · change password</a>
      </nav>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button
          type="submit"
          className="text-xs text-neutral-500 underline hover:text-neutral-700"
        >
          Sign out
        </button>
      </form>
      <p className="text-xs text-neutral-500">Build: 0.4.0 · Sprint 3</p>
    </main>
  );
}

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import CreateUserForm from './CreateUserForm';
import UserRow from './UserRow';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/');

  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { role: 'asc' }, { username: 'asc' }],
    select: { id: true, username: true, name: true, role: true, color: true, active: true, createdAt: true },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Admin · create, reset, enable / disable, change role.
          </p>
        </div>
        <a href="/" className="text-sm underline">← Home</a>
      </header>

      <CreateUserForm />

      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Board color</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={{
                  id: u.id,
                  username: u.username,
                  name: u.name,
                  role: u.role,
                  color: u.color,
                  active: u.active,
                  isSelf: u.id === session.user.id,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

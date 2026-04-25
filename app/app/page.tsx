export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Novum Scheduler</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Sprint 0 scaffold. Auth, projects, and the installer board land in the next sprints.
      </p>
      <p className="text-sm text-neutral-500 dark:text-neutral-500">
        Build: 0.1.0 · Sprint 0
      </p>
    </main>
  );
}

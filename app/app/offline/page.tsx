import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline · Novum' };
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Reconnect to load fresh schedule data. Anything you typed before
        going offline is still in your browser — try again once you&apos;re
        back on Wi-Fi or mobile data.
      </p>
      <a
        href="/"
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Try again
      </a>
    </main>
  );
}

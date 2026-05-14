import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { BUSINESS_TIMEZONE, humanDateLabel } from '@/lib/dates';
import { formatTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Public read-only client portal for a single Project. The route is
 * UNAUTHED — gated only by the per-project clientPortalToken (a
 * 32-char URL-safe random). Lazy-init via the schedule UI on the
 * project detail page.
 *
 * What we expose:
 *   - project name + client + status
 *   - scheduled tasks (title + date/time + status)
 *   - recent photos from notes (last 12)
 *   - open deficiencies (severity + description)
 *
 * What we DON'T expose:
 *   - installer names
 *   - internal notes / private comments
 *   - audit log / time entries / hourly rates
 *   - checklists (operator-internal scoring)
 *
 * Filter list reviewed against the Feature Review §3 P0.4 guidance.
 */
export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 64) notFound();

  const project = await prisma.project.findFirst({
    where: { clientPortalToken: token },
    select: {
      id: true,
      name: true,
      clientName: true,
      color: true,
      status: true,
      archivedAt: true,
    },
  });
  if (!project) notFound();

  const [tasks, recentPhotos, openDeficiencies] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id, scheduledDate: { not: null } },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledStartMinute: 'asc' }],
      select: {
        id: true,
        title: true,
        scheduledDate: true,
        scheduledStartMinute: true,
        status: true,
      },
    }),
    // Pull the 12 most recent photos across all the project's notes.
    // Each is served via the tokenized /api/p-photos/[id] route so the
    // client can render without an auth cookie.
    prisma.notePhoto.findMany({
      where: { note: { task: { projectId: project.id } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, width: true, height: true },
    }),
    prisma.deficiency.findMany({
      where: {
        status: 'open',
        task: { projectId: project.id },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        description: true,
        severity: true,
        dueBy: true,
      },
    }),
  ]);

  const accent = project.color ?? '#0ea5e9';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-5">
      <header className="flex flex-col gap-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            Project update — {project.clientName ?? 'shared by Novum Designs'}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        {project.archivedAt && (
          <p className="text-xs text-neutral-500">This project is archived.</p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Schedule</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-neutral-500">No scheduled work yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {tasks.map((t) => {
              const dateISO = t.scheduledDate
                ? new Date(t.scheduledDate).toISOString().slice(0, 10)
                : null;
              return (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${t.status === 'done' ? 'text-neutral-500 line-through' : ''}`}>
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {dateISO ? humanDateLabel(dateISO) : '—'}
                      {t.scheduledStartMinute !== null && (
                        <> · {formatTime(t.scheduledStartMinute)}</>
                      )}
                    </p>
                  </div>
                  <StatusPill status={t.status} />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {openDeficiencies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Open issues ({openDeficiencies.length})</h2>
          <ol className="flex flex-col gap-2">
            {openDeficiencies.map((d) => (
              <li
                key={d.id}
                className="rounded border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-700 dark:bg-amber-950/30"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider">
                    {d.severity}
                  </span>
                  {d.dueBy && (
                    <span className="text-xs text-neutral-600 dark:text-neutral-400">
                      target by{' '}
                      {new Date(d.dueBy).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        timeZone: BUSINESS_TIMEZONE,
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{d.description}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recentPhotos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Recent photos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recentPhotos.map((p) => (
              <a
                key={p.id}
                href={`/api/p-photos/${p.id}?t=${token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/p-photos/${p.id}?t=${token}`}
                  alt=""
                  loading="lazy"
                  width={p.width}
                  height={p.height}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
        Shared by Novum Designs. This page updates as work progresses;
        bookmark it for a live view.
      </footer>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  // Client-facing copy: "blocked" → "on hold" reads better than the
  // internal jargon.
  const label = status === 'in_progress' ? 'in progress' : status === 'blocked' ? 'on hold' : status;
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[status] ?? map.pending}`}>
      {label}
    </span>
  );
}

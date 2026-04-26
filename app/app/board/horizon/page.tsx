import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  dayLabel,
  humanDateLabel,
  mondayOf,
  shiftDateISO,
  todayISO,
} from '@/lib/dates';
import { DAY_END_MIN, DAY_START_MIN, DEFAULT_DURATION_MIN, formatDuration } from '@/lib/time';

export const dynamic = 'force-dynamic';

const DAY_CAPACITY_MIN = DAY_END_MIN - DAY_START_MIN; // 540 = 9 hr

const WEEKS_OPTIONS = [4, 6, 12] as const;
type Weeks = (typeof WEEKS_OPTIONS)[number];

function parseWeeks(raw: string | undefined): Weeks {
  const n = Number(raw);
  if ((WEEKS_OPTIONS as readonly number[]).includes(n)) return n as Weeks;
  return 6;
}

// Convert a UTC-midnight Date to its YYYY-MM-DD ISO date. Stored
// scheduledDate is always UTC-midnight by convention, so toISOString.slice(10)
// is correct here.
function isoOf(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export default async function HorizonPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'installer') redirect('/me');

  const sp = await searchParams;
  const weeks = parseWeeks(sp?.weeks);
  const days = weeks * 7;
  const today = todayISO();
  const start = mondayOf(today); // anchor heatmap at Monday of current week
  const dayList: string[] = [];
  for (let i = 0; i < days; i++) dayList.push(shiftDateISO(start, i));
  const lastDayISO = dayList[dayList.length - 1];

  const startDate = new Date(start + 'T00:00:00.000Z');
  const endDate = new Date(shiftDateISO(lastDayISO, 1) + 'T00:00:00.000Z');

  const [installers, scheduled] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'installer', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    prisma.task.findMany({
      where: {
        scheduledDate: { gte: startDate, lt: endDate },
        assignedInstallerId: { not: null },
      },
      select: {
        id: true,
        scheduledDate: true,
        estimatedMinutes: true,
        status: true,
        assignedInstallerId: true,
      },
    }),
  ]);

  // Aggregate: minutes & task count per (installerId, dateISO).
  type CellAgg = { minutes: number; count: number };
  const grid = new Map<string, CellAgg>(); // key = installerId|dateISO
  for (const t of scheduled) {
    if (!t.assignedInstallerId || !t.scheduledDate) continue;
    if (t.status === 'done') continue; // done tasks shouldn't count toward future load
    const dateISO = isoOf(t.scheduledDate);
    const key = `${t.assignedInstallerId}|${dateISO}`;
    const cur = grid.get(key) ?? { minutes: 0, count: 0 };
    cur.minutes += t.estimatedMinutes ?? DEFAULT_DURATION_MIN;
    cur.count += 1;
    grid.set(key, cur);
  }

  // Per-installer summaries.
  type Summary = {
    installer: typeof installers[number];
    nextFreeDay: string | null;
    lastScheduledDay: string | null;
    totalMinutes: number;
    totalTasks: number;
    bookedDayCount: number;
    overbookedDayCount: number;
  };
  const summaries: Summary[] = installers.map((i) => {
    let nextFreeDay: string | null = null;
    let lastScheduledDay: string | null = null;
    let totalMinutes = 0;
    let totalTasks = 0;
    let bookedDayCount = 0;
    let overbookedDayCount = 0;

    for (const d of dayList) {
      if (d < today) continue;
      const cell = grid.get(`${i.id}|${d}`);
      const minutes = cell?.minutes ?? 0;
      if (minutes > 0) {
        totalMinutes += minutes;
        totalTasks += cell!.count;
        bookedDayCount += 1;
        lastScheduledDay = d; // dayList is ordered; last write is the latest
        if (minutes > DAY_CAPACITY_MIN) overbookedDayCount += 1;
      }
      if (nextFreeDay === null) {
        const isWeekend = (() => {
          const dow = new Date(d + 'T00:00:00.000Z').getUTCDay();
          return dow === 0 || dow === 6;
        })();
        if (!isWeekend && minutes < DAY_CAPACITY_MIN) {
          nextFreeDay = d;
        }
      }
    }

    return {
      installer: i,
      nextFreeDay,
      lastScheduledDay,
      totalMinutes,
      totalTasks,
      bookedDayCount,
      overbookedDayCount,
    };
  });

  // Group days into rows of 7 for heatmap headers.
  type WeekHeader = { weekStart: string; days: string[] };
  const weekRows: WeekHeader[] = [];
  for (let i = 0; i < dayList.length; i += 7) {
    weekRows.push({ weekStart: dayList[i], days: dayList.slice(i, i + 7) });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-5 p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule horizon</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Showing</span>
          {WEEKS_OPTIONS.map((w) => (
            <a
              key={w}
              href={`/board/horizon?weeks=${w}`}
              className={`rounded border px-2 py-1 ${
                w === weeks
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900'
              }`}
            >
              {w} wk
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <a href={`/board?date=${today}`} className="underline">Day view</a>
          <a href={`/board/week?date=${today}`} className="underline">Week view</a>
          <a href="/projects" className="underline">Projects</a>
          <a href="/" className="underline">Home</a>
        </div>
      </header>

      {/* Per-installer summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => (
          <article
            key={s.installer.id}
            className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-2">
              {s.installer.color && (
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.installer.color }} />
              )}
              <h2 className="text-base font-semibold">{s.installer.name}</h2>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Next free day</dt>
                <dd className="mt-0.5 font-medium">
                  {s.nextFreeDay ? (
                    <a className="underline" href={`/board?date=${s.nextFreeDay}`}>
                      {humanDateLabel(s.nextFreeDay)}
                    </a>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">All booked through {weeks} wk</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Last scheduled</dt>
                <dd className="mt-0.5 font-medium">
                  {s.lastScheduledDay ? (
                    <a className="underline" href={`/board?date=${s.lastScheduledDay}`}>
                      {humanDateLabel(s.lastScheduledDay)}
                    </a>
                  ) : (
                    <span className="text-neutral-500">Nothing scheduled</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Booked</dt>
                <dd className="mt-0.5 font-medium">
                  {formatDuration(s.totalMinutes) || '0h'} · {s.totalTasks} task{s.totalTasks === 1 ? '' : 's'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Days w/ work</dt>
                <dd className="mt-0.5 font-medium">
                  {s.bookedDayCount} of {weeks * 7}
                  {s.overbookedDayCount > 0 && (
                    <span className="ml-1 text-xs text-red-700 dark:text-red-300">
                      ({s.overbookedDayCount} over capacity)
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </article>
        ))}
        {summaries.length === 0 && (
          <p className="text-sm text-neutral-500">
            No active installers. Create one at <a className="underline" href="/admin/users">Admin · Users</a>.
          </p>
        )}
      </section>

      {/* Heatmap */}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Capacity heatmap</h2>
        <p className="text-xs text-neutral-500">
          Each cell = scheduled minutes that day, colored by share of the {formatDuration(DAY_CAPACITY_MIN)} workday. Click any cell to open the day&apos;s board.
        </p>
        <Legend />
        <div className="overflow-x-auto rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {weekRows.map((row) => (
            <div key={row.weekStart} className="border-b border-neutral-200 last:border-0 dark:border-neutral-800">
              {/* Day header row for this week */}
              <div
                className="grid border-b border-neutral-100 bg-neutral-50 text-[10px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950"
                style={{ gridTemplateColumns: `160px repeat(7, minmax(72px, 1fr))` }}
              >
                <div className="px-2 py-1 font-medium text-neutral-400">
                  Week of {dayLabel(row.weekStart).dayNum}
                </div>
                {row.days.map((iso) => {
                  const isToday = iso === today;
                  const { weekday, dayNum } = dayLabel(iso);
                  return (
                    <div
                      key={iso}
                      className={`px-2 py-1 text-center ${
                        isToday ? 'font-semibold text-blue-700 dark:text-blue-300' : ''
                      }`}
                    >
                      <div>{weekday}</div>
                      <div>{dayNum.replace(/^[A-Za-z]+\s/, '')}</div>
                    </div>
                  );
                })}
              </div>
              {/* Installer rows */}
              {installers.map((i) => (
                <div
                  key={i.id}
                  className="grid"
                  style={{ gridTemplateColumns: `160px repeat(7, minmax(72px, 1fr))` }}
                >
                  <div className="flex items-center gap-2 border-r border-neutral-100 px-2 py-1 text-sm dark:border-neutral-800">
                    {i.color && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
                    )}
                    <span className="truncate">{i.name}</span>
                  </div>
                  {row.days.map((iso) => {
                    const cell = grid.get(`${i.id}|${iso}`);
                    const minutes = cell?.minutes ?? 0;
                    const dow = new Date(iso + 'T00:00:00.000Z').getUTCDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isPast = iso < today;
                    return (
                      <a
                        key={iso}
                        href={`/board?date=${iso}`}
                        className={`flex flex-col items-center justify-center gap-0.5 border-r border-neutral-100 px-1 py-2 text-xs hover:ring-1 hover:ring-blue-400 dark:border-neutral-800 ${heatmapClass(
                          minutes,
                          isWeekend,
                          isPast,
                        )}`}
                        title={`${i.name} · ${humanDateLabel(iso)} · ${formatDuration(minutes) || '0h'}${
                          cell ? ` · ${cell.count} task${cell.count === 1 ? '' : 's'}` : ''
                        }`}
                      >
                        {minutes > 0 ? (
                          <>
                            <span className="font-medium">{formatDuration(minutes)}</span>
                            {cell && cell.count > 1 && (
                              <span className="text-[10px] opacity-75">×{cell.count}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] opacity-40">{isWeekend ? '·' : ''}</span>
                        )}
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

// Tailwind class buckets for the heatmap. Pinned to literal class names so
// the JIT keeps them in the bundle.
function heatmapClass(minutes: number, isWeekend: boolean, isPast: boolean): string {
  if (isPast && minutes === 0) return 'bg-neutral-50 text-neutral-400 dark:bg-neutral-950 dark:text-neutral-600';
  if (minutes === 0) {
    return isWeekend
      ? 'bg-neutral-100 text-neutral-300 dark:bg-neutral-900 dark:text-neutral-700'
      : 'bg-white text-neutral-300 dark:bg-neutral-900 dark:text-neutral-600';
  }
  const ratio = minutes / DAY_CAPACITY_MIN;
  if (ratio > 1) return 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-100';
  if (ratio >= 0.95) return 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100';
  if (ratio >= 0.6) return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100';
  if (ratio >= 0.3) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
}

function Legend() {
  const buckets = [
    { label: '0', cls: 'bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800' },
    { label: '<30%', cls: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: '30–60%', cls: 'bg-emerald-100 dark:bg-emerald-900/40' },
    { label: '60–95%', cls: 'bg-emerald-200 dark:bg-emerald-900/60' },
    { label: 'Full', cls: 'bg-amber-200 dark:bg-amber-900/60' },
    { label: 'Over', cls: 'bg-red-200 dark:bg-red-900/60' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
      <span>Capacity:</span>
      {buckets.map((b) => (
        <span key={b.label} className="flex items-center gap-1">
          <span className={`inline-block h-3 w-4 rounded-sm ${b.cls}`} />
          {b.label}
        </span>
      ))}
    </div>
  );
}

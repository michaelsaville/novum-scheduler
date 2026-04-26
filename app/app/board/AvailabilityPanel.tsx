import { humanDateLabel, todayISO } from '@/lib/dates';
import { formatTime, DEFAULT_DURATION_MIN } from '@/lib/time';
import { nextAvailableForInstaller, type SlotResult } from '@/lib/availability';

type Installer = { id: string; name: string; color: string | null };

type Props = {
  installers: Installer[];
};

// Server component. Runs the gap-finding query for each installer in parallel
// and renders a one-line "next available" pill per person above the board.
export default async function AvailabilityPanel({ installers }: Props) {
  if (installers.length === 0) return null;

  const today = todayISO();

  const results: Array<{ installer: Installer; slot: SlotResult }> = await Promise.all(
    installers.map(async (i) => ({
      installer: i,
      slot: await nextAvailableForInstaller({
        installerId: i.id,
        durationMin: DEFAULT_DURATION_MIN,
        fromDateISO: today,
        horizonDays: 30,
      }),
    })),
  );

  return (
    <section className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <header className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Availability</h2>
        <span className="text-xs text-neutral-500">Next 1-hour opening per installer</span>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {results.map(({ installer, slot }) => (
          <li key={installer.id} className="flex items-center gap-2 text-sm">
            {installer.color && (
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: installer.color }} />
            )}
            <span className="font-medium">{installer.name}</span>
            <span className="text-neutral-400">·</span>
            {slot.ok ? (
              <a
                href={`/board?date=${slot.dateISO}`}
                className="truncate text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
              >
                {dayLabelRelative(slot.dateISO, today)} · {formatTime(slot.startMin)}
              </a>
            ) : (
              <span className="truncate text-amber-700 dark:text-amber-300">{slot.error}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function dayLabelRelative(iso: string, today: string): string {
  if (iso === today) return 'Today';
  // Shift today by 1 day and compare for the "Tomorrow" shortcut without
  // reaching for another helper.
  const t = new Date(today + 'T00:00:00.000Z');
  t.setUTCDate(t.getUTCDate() + 1);
  if (iso === t.toISOString().slice(0, 10)) return 'Tomorrow';
  return humanDateLabel(iso);
}

/**
 * Date helpers that pin "today" to the business timezone instead of UTC.
 *
 * Background: scheduledDate is stored as a UTC-midnight DateTime — the
 * date-only ISO string (YYYY-MM-DD) is the source of truth, the time
 * component is always 00:00:00.000Z. This makes calendar-day equality
 * deterministic across timezones at the cost of needing a *separate*
 * answer for "what calendar day is the user looking at right now?"
 *
 * Pre-fix the answer was "UTC's current day" — which meant a scheduler
 * in EST editing after ~7pm local saw "today" jump to tomorrow's date,
 * and dropped tasks landed a day off. These helpers compute today in
 * America/New_York via Intl.DateTimeFormat (DST-aware, no library).
 */

export const BUSINESS_TIMEZONE = 'America/New_York';

// en-CA produces YYYY-MM-DD natively in numeric mode, so we don't have
// to reassemble the parts ourselves.
const ISO_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in the business timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  return ISO_FORMATTER.format(new Date());
}

export function isValidDateISO(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(new Date(s + 'T00:00:00.000Z').getTime())
  );
}

export function shiftDateISO(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Monday's ISO date for the week containing `iso`. Sunday is treated as
 * the last day of the previous week (offset −6).
 */
export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * UTC-midnight `[start, end)` bounds for a single-day query. Use with
 * `scheduledDate: { gte: start, lt: end }`.
 */
export function dayBoundsUTC(iso: string): { start: Date; end: Date } {
  const start = new Date(iso + 'T00:00:00.000Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Long-form date label, e.g. "Mon, Apr 27, 2026". */
export function humanDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Compact two-line label for week-view column headers. */
export function dayLabel(iso: string): { weekday: string; dayNum: string } {
  const d = new Date(iso + 'T00:00:00.000Z');
  return {
    weekday: d.toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    }),
    dayNum: d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

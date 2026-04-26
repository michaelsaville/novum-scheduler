// Time-of-day helpers for the scheduler. Times are stored as integer minutes
// from midnight in the business timezone (see lib/dates.ts → America/New_York).
// We don't try to support cross-day shifts — installer day is 8am–5pm.

export const DAY_START_MIN = 8 * 60;   // 8:00am
export const DAY_END_MIN = 17 * 60;    // 5:00pm
export const SLOT_MIN = 60;             // 1-hour slots
export const DEFAULT_DURATION_MIN = 60; // shown when estimatedMinutes is null

export const HOUR_SLOTS: number[] = (() => {
  const out: number[] = [];
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SLOT_MIN) out.push(m);
  return out;
})();

export const DURATION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hr' },
  { value: 90, label: '1.5 hr' },
  { value: 120, label: '2 hr' },
  { value: 180, label: '3 hr' },
  { value: 240, label: '4 hr' },
  { value: 360, label: '6 hr' },
  { value: 480, label: '8 hr' },
];

export function formatTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

export function formatTimeRange(startMin: number | null, durationMin: number | null): string {
  if (startMin === null) return '';
  const dur = durationMin ?? DEFAULT_DURATION_MIN;
  return `${formatTime(startMin)}–${formatTime(startMin + dur)}`;
}

export function formatDuration(min: number | null): string {
  if (min === null) return '';
  if (min < 60) return `${min}m`;
  if (min % 60 === 0) return `${min / 60}h`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m}m`;
}

// Snap a free-form minute to the nearest hour slot, clamped to the working day.
export function snapToSlot(min: number): number {
  const clamped = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SLOT_MIN, min));
  return Math.round((clamped - DAY_START_MIN) / SLOT_MIN) * SLOT_MIN + DAY_START_MIN;
}

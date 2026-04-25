// iCalendar (RFC 5545) builder for per-installer scheduled-task feeds.
// Each scheduled task becomes an all-day VEVENT.
//
// Notes on conformance:
//   - Lines are CRLF-terminated.
//   - Long lines are folded at 75 octets per RFC 5545 §3.1 (continuation
//     starts with a single space).
//   - Text values escape backslash, comma, semicolon, and newline per
//     RFC 5545 §3.3.11.
//   - All-day events use VALUE=DATE; DTEND is exclusive (next day).
//   - DTSTAMP is current time in UTC.

export type IcsTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduledDateISO: string; // yyyy-mm-dd
  project: { name: string; clientName: string | null };
};

export type IcsCalendar = {
  installerName: string;
  origin: string; // e.g. https://novum.pcc2k.com
  tasks: IcsTask[];
};

function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatDateOnly(iso: string): string {
  // 2026-04-26 → 20260426
  return iso.replace(/-/g, '');
}

function nextDayDateOnly(iso: string): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function nowUtcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function foldLine(line: string): string {
  // RFC 5545: lines must not exceed 75 octets; continuation = CRLF + space.
  // We fold by character (close enough — non-ASCII is rare here).
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const take = first ? 75 : 74; // continuation lines lose 1 char to the leading space
    parts.push((first ? '' : ' ') + rest.slice(0, take));
    rest = rest.slice(take);
    first = false;
  }
  return parts.join('\r\n');
}

export function buildIcs(cal: IcsCalendar): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Novum Scheduler//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${esc(`Novum — ${cal.installerName}`)}`);
  lines.push(`NAME:${esc(`Novum — ${cal.installerName}`)}`);
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT15M');
  lines.push('X-PUBLISHED-TTL:PT15M');

  const stamp = nowUtcStamp();

  for (const t of cal.tasks) {
    const summaryParts = [t.title, t.project.name];
    if (t.project.clientName) summaryParts.push(t.project.clientName);
    const summary = summaryParts.join(' · ');

    const descLines: string[] = [];
    descLines.push(`Project: ${t.project.name}`);
    if (t.project.clientName) descLines.push(`Client: ${t.project.clientName}`);
    descLines.push(`Status: ${t.status.replace('_', ' ')}`);
    if (t.description) descLines.push('', t.description);
    descLines.push('', `${cal.origin}/tasks/${t.id}`);
    const description = descLines.join('\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:task-${t.id}@novum.pcc2k.com`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(t.scheduledDateISO)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDayDateOnly(t.scheduledDateISO)}`);
    lines.push(`SUMMARY:${esc(summary)}`);
    lines.push(`DESCRIPTION:${esc(description)}`);
    lines.push(`URL:${cal.origin}/tasks/${t.id}`);
    lines.push(`STATUS:${t.status === 'done' ? 'COMPLETED' : t.status === 'blocked' ? 'TENTATIVE' : 'CONFIRMED'}`);
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

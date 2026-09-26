/**
 * An iCalendar (RFC 5545) feed of a lab's calendar, for Google Calendar,
 * Apple Calendar and Outlook to subscribe to.
 *
 * Kept to the parts every calendar app reads the same way: all-day entries
 * for deadlines, one-hour entries for meetings with a time. Times are
 * "floating" (no timezone), so 2pm in the lab means 2pm in the calendar.
 */

export type FeedEvent = { id: string; title: string; onDate: string; atTime: string | null; notes: string | null };
export type FeedDeadline = { id: string; title: string; dueOn: string | null; status: string; assigneeName: string | null; forEveryone: boolean };

/** Commas, semicolons, backslashes and newlines are syntax in iCalendar. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets must be folded, or strict parsers drop them. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const width = new TextEncoder().encode(char).length;
    if (size + width > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(input: {
  calendarName: string;
  host: string;
  events: FeedEvent[];
  deadlines: FeedDeadline[];
  now: Date;
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Labvia//Lab calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    // Asks calendar apps to check back hourly. Google decides for itself and
    // is usually slower; that is Google's refresh, not something we control.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const dtstamp = stamp(input.now);

  for (const e of input.events) {
    lines.push('BEGIN:VEVENT', `UID:event-${e.id}@${input.host}`, `DTSTAMP:${dtstamp}`);
    if (e.atTime && /^\d{2}:\d{2}$/.test(e.atTime)) {
      const [h, m] = e.atTime.split(':').map(Number) as [number, number];
      const end = `${String(Math.min(h + 1, 23)).padStart(2, '0')}${String(h + 1 > 23 ? 59 : m).padStart(2, '0')}00`;
      lines.push(`DTSTART:${compactDate(e.onDate)}T${e.atTime.replace(':', '')}00`, `DTEND:${compactDate(e.onDate)}T${end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.onDate)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(e.onDate))}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
    lines.push('END:VEVENT');
  }

  for (const t of input.deadlines) {
    if (!t.dueOn) continue;
    const who = t.forEveryone ? 'Whole lab' : (t.assigneeName ?? 'Unassigned');
    const done = t.status === 'done';
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${t.id}@${input.host}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compactDate(t.dueOn)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(t.dueOn))}`,
      `SUMMARY:${escapeText(`${done ? '✓ ' : 'Due: '}${t.title}`)}`,
      `DESCRIPTION:${escapeText(`Task for ${who}. Open it at https://${input.host}/tasks/${t.id}`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

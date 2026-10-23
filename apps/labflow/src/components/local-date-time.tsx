'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/display';

/**
 * A timestamp in the reader's own time zone, with the time of day.
 *
 * The server renders in UTC, which would put an evening note on tomorrow's
 * date. So the server sends the date alone, and the browser, which knows
 * where the reader is, replaces it with the local date and time once mounted.
 */
export function LocalDateTime({ value }: { value: Date | string }) {
  const iso = new Date(value).toISOString();
  const [text, setText] = useState(() => formatDate(value));
  useEffect(() => {
    setText(
      new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}

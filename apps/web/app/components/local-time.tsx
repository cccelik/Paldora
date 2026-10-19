'use client';

import { useEffect, useState } from 'react';

const format = (date: Date, timeZone?: string) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

/**
 * Renders in UTC on the server, then in the viewer’s own timezone once it is
 * mounted. The first client render matches the server, so hydration is clean.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(`${format(new Date(iso), 'UTC')} UTC`);
  useEffect(() => {
    setText(format(new Date(iso)));
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}

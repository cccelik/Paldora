'use client';

import { useEffect, useRef, useState } from 'react';

interface PendingFocus {
  readonly key: string;
  readonly direction: 'up' | 'down';
}

/**
 * Keeps keyboard focus with an item that just moved. React may re-insert a
 * moved row, which drops focus, so after the render this puts focus back on
 * the same move button, or on the other one when the item reached an end
 * and its button is now disabled. It also holds the live announcement.
 */
export function useMoveFocus() {
  const list = useRef<HTMLOListElement>(null);
  const [pending, setPending] = useState<PendingFocus | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!pending || !list.current) return;
    const find = (direction: 'up' | 'down') =>
      list.current?.querySelector<HTMLButtonElement>(
        `[data-move="${pending.key}:${direction}"]`,
      );
    const same = find(pending.direction);
    const other = find(pending.direction === 'up' ? 'down' : 'up');
    (same && !same.disabled ? same : other)?.focus();
    setPending(null);
  }, [pending]);

  function moved(key: string, delta: -1 | 1, words: string) {
    setPending({ key, direction: delta === -1 ? 'up' : 'down' });
    setAnnouncement(words);
  }

  return { list, announcement, moved, announce: setAnnouncement };
}

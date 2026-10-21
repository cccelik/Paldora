'use client';

import { useCallback, useEffect, useRef } from 'react';
/** Keeps the latest callback and cancels pending work when unmounted. */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
) {
  const latest = useRef(callback);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (...args: Args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...args), delay);
    },
    [delay],
  );
}

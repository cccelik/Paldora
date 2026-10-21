'use client';

import { useCallback, type KeyboardEvent, type RefObject } from 'react';
/** Cmd/Ctrl+Enter submits through normal form validation. */
export function useSubmitShortcut(
  form: RefObject<HTMLFormElement | null>,
  enabled = true,
) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (enabled) form.current?.requestSubmit();
      }
    },
    [form, enabled],
  );
}

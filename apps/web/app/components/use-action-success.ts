'use client';

import { useEffect, useRef } from 'react';
import { type ActionResult } from '../lib/action-result';
/** Handles each successful result once even when the callback changes. */
export function useActionSuccess<Data>(
  result: ActionResult<Data>,
  onSuccess: (data: Data) => void,
) {
  const handled = useRef<ActionResult<Data> | null>(null);
  useEffect(() => {
    if (result === handled.current) return;
    handled.current = result;
    if (result.status === 'success') onSuccess(result.data);
  }, [result, onSuccess]);
}

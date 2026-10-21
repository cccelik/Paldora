'use client';

import { type ActionResult } from '@/lib/actions/action-result';
import { useEffect, useRef } from 'react';
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

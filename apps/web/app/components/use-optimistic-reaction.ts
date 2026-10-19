'use client';

import { startTransition, useOptimistic, useState } from 'react';
import type { ActionOutcome } from '../lib/action-result';
import {
  withViewerReaction,
  type ReactionSummaryLike,
} from '../lib/reaction-summary';
import { useToast } from './toast';

/**
 * A reaction summary from the server, shown optimistically while a reaction
 * is being sent. The action's answer becomes the new base; a fresh server
 * render (a new `initial`) replaces both.
 */
export function useOptimisticReaction<Summary extends ReactionSummaryLike>(
  initial: Summary,
  send: (kind: string | null) => Promise<ActionOutcome<Summary>>,
) {
  const [summary, setSummary] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [shown, setOptimistic] = useOptimistic(summary);
  const showToast = useToast();

  if (initial !== seen) {
    setSeen(initial);
    setSummary(initial);
  }

  const react = (kind: string | null) =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        setOptimistic((current) => withViewerReaction(current, kind));
        const result = await send(kind);
        startTransition(() => {
          if (result.status === 'success') setSummary(result.data);
        });
        if (result.status === 'error') {
          showToast({ message: result.message, tone: result.tone });
        }
        resolve();
      });
    });

  return { shown, setSummary, react };
}

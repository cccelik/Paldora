'use client';

import { startTransition, useOptimistic, useState } from 'react';
import { type ActionOutcome } from '../lib/action-result';
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

  /**
   * Shows `kind` at once and runs `work`; its summary becomes the new base.
   * Resolves with the outcome so callers with their own error UI (the
   * camera) can use it.
   */
  const run = (
    kind: string | null,
    work: () => Promise<ActionOutcome<Summary>>,
  ) =>
    new Promise<ActionOutcome<Summary>>((resolve) => {
      startTransition(async () => {
        setOptimistic((current) => withViewerReaction(current, kind));
        const result = await work();
        startTransition(() => {
          if (result.status === 'success') setSummary(result.data);
        });
        resolve(result);
      });
    });

  const react = async (kind: string | null) => {
    const result = await run(kind, () => send(kind));
    if (result.status === 'error') {
      showToast({ message: result.message, tone: result.tone });
    }
  };

  return { shown, setSummary, react, run };
}

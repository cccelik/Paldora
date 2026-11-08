'use client';

import { Button, StatusPanel } from '@/components/ui';
/**
 * The segment error boundary inside the app shell. It shows no details: the
 * digest correlates with server logs without exposing internals.
 */
export default function SignedInError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StatusPanel
      title="Something went wrong."
      action={<Button onClick={() => retry()}>Try again</Button>}
    >
      Nothing you shared was lost. Try again in a moment.
      {error.digest ? ` Reference: ${error.digest}` : null}
    </StatusPanel>
  );
}

import { logEvent } from '@paldora/firebase-trusted';

/** Wrap a job or handler: log completion/failure (no messages), then rethrow. */
export function observedJob<Args extends unknown[], T>(
  name: string,
  fn: (...args: Args) => Promise<T>,
  jobIdOf?: (...args: Args) => string | undefined,
): (...args: Args) => Promise<T> {
  return async (...args) => {
    const started = Date.now();
    const jobId = jobIdOf?.(...args);
    try {
      const result = await fn(...args);
      logEvent('INFO', {
        event: `${name}.completed`,
        ...(jobId ? { jobId } : {}),
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      logEvent(
        'ERROR',
        {
          event: `${name}.failed`,
          ...(jobId ? { jobId } : {}),
          durationMs: Date.now() - started,
        },
        error,
      );
      throw error;
    }
  };
}

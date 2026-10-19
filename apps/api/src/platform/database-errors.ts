interface PostgresError {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

/** Drizzle wraps driver errors; the PostgreSQL error is the `cause`. */
function postgresErrorOf(error: unknown): PostgresError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as PostgresError & { cause?: unknown };
  if (typeof candidate.code === 'string') return candidate;
  return candidate.cause ? postgresErrorOf(candidate.cause) : undefined;
}

/** True when a unique constraint (optionally a specific one) rejected a write. */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const postgres = postgresErrorOf(error);
  return (
    postgres?.code === '23505' &&
    (constraint === undefined || postgres.constraint === constraint)
  );
}

/** True when a CHECK constraint (optionally a specific one) rejected a write. */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const postgres = postgresErrorOf(error);
  return (
    postgres?.code === '23514' &&
    (constraint === undefined || postgres.constraint === constraint)
  );
}

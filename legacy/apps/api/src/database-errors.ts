interface ErrorWithCodeAndCause {
  code?: unknown;
  cause?: unknown;
}

export function hasDatabaseErrorCode(
  error: unknown,
  expectedCode: string,
): boolean {
  let current = error;
  const visited = new Set<unknown>();
  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) return false;
    visited.add(current);
    const candidate = current as ErrorWithCodeAndCause;
    if (candidate.code === expectedCode) return true;
    current = candidate.cause;
  }
  return false;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasDatabaseErrorCode(error, '23505');
}

/** An optional timestamp as the contract sends it: ISO 8601, or null. */
export const isoOrNull = (date: Date | null): string | null =>
  date?.toISOString() ?? null;

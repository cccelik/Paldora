/**
 * The component gallery under `/design-preview` exists only for local
 * development and the local browser tests. Staging, production and an unset
 * or invalid `PALDORA_ENV` all answer 404.
 */
export function designPreviewEnabled(
  deployment: string | undefined = process.env.PALDORA_ENV,
): boolean {
  return deployment === 'local';
}

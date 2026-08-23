const allowedCallbackPaths = new Set(['/home', '/reset-password']);

export function safeCallbackPath(value: string | null): string {
  return value && allowedCallbackPaths.has(value) ? value : '/home';
}

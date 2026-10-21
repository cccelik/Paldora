import { type Route } from 'next';
const allowedCallbackPaths = new Set<Route>(['/home', '/reset-password']);

/** Auth callbacks may only continue to known in-app paths. */
export function safeCallbackPath(value: string | null): Route {
  return value && allowedCallbackPaths.has(value as Route)
    ? (value as Route)
    : '/home';
}

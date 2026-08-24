import type { Route } from 'next';

export function roomPath(username: string): Route {
  return `/rooms/${encodeURIComponent(username)}` as Route;
}

export function roomCustomizePath(username: string): Route {
  return `${roomPath(username)}/customize` as Route;
}

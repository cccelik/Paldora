import '@paldora/tokens/room-themes.css';
import { type ReactNode } from 'react';
/**
 * Room themes as static CSS scoped to `.room-canvas[data-room-*]`, loaded
 * only under `/rooms`. Deliberately no `loading.tsx` anywhere below: a
 * streamed fallback would send 200 before a ROOM_NOT_FOUND decision.
 */
export default function RoomLayout({ children }: { children: ReactNode }) {
  return children;
}

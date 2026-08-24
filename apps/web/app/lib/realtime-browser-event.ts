'use client';

export const PALDORA_ACTIVITY_EVENT = 'paldora:activity';

export interface RealtimeActivityDetail {
  type: string;
  data: string;
}

export function announceRealtimeActivity(detail: RealtimeActivityDetail): void {
  window.dispatchEvent(
    new CustomEvent<RealtimeActivityDetail>(PALDORA_ACTIVITY_EVENT, { detail }),
  );
}

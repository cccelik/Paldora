import { setLogSink } from '@paldora/firebase-trusted';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/firebase/data', () => ({
  firebaseWebData: () =>
    Promise.reject(new Error('https://x?X-Goog-Signature=s a@b.c')),
}));
vi.mock('@/lib/server/firebase/session', () => ({
  FIREBASE_SESSION_COOKIE: 'c',
  firebaseAdminServices: () => ({
    sessions: { verify: () => Promise.resolve('uid') },
  }),
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'v' }) }),
}));

describe('account download route', () => {
  it('returns 503 and logs only the error name', async () => {
    const lines: string[] = [];
    const previous = setLogSink((line) => lines.push(line));
    const { GET } = await import('./route');
    const response = await GET();
    setLogSink(previous);
    expect(response.status).toBe(503);
    expect(lines.join('\n')).toContain('"errorName":"Error"');
    expect(lines.join('\n')).not.toMatch(/X-Goog|a@b\.c|https:/u);
  });
});

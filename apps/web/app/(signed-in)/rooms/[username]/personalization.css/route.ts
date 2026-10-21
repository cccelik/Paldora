import { apiClient } from '@/lib/server/session';
import { ApiClientError } from '@paldora/api-client';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const headers = {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Cookie',
  };
  try {
    const { username } = await context.params;
    const result = await (await apiClient()).roomPersonalization(username);
    return new Response(result.css, { headers });
  } catch (error) {
    return new Response('', {
      status: error instanceof ApiClientError && error.status < 500 ? 404 : 503,
      headers,
    });
  }
}

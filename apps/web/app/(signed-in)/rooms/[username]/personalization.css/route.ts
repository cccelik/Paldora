import { firebaseWebData } from '@/lib/server/firebase/data';
import { ApiClientError } from '@/lib/server/web-data-error';
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
    const result = await (
      await firebaseWebData()
    ).roomPersonalization(username);
    return new Response(result.css, { headers });
  } catch (error) {
    return new Response('', {
      status: error instanceof ApiClientError && error.status < 500 ? 404 : 503,
      headers,
    });
  }
}

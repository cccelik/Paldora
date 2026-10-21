import { apiClient } from '@/lib/server/session';

/** Resolve a fresh, short-lived signed URL only when the owner clicks. */
export async function GET() {
  try {
    const client = await apiClient();
    const { export: archive } = await client.accountExport();
    if (archive?.status !== 'ready') {
      return new Response('Archive is not ready.', {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const { url } = await client.downloadAccountExport(archive.id);
    return new Response(null, {
      status: 303,
      headers: { Location: url, 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return new Response('Archive is unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}

import { getFeed } from '@/lib/server/feed';
export async function GET() {
  try {
    return Response.json(await getFeed(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      {
        error:
          'The incident feed is temporarily unavailable. Please try again shortly.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
      },
    );
  }
}

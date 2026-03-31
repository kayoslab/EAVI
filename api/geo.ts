import { geolocation } from '@vercel/functions';

export const runtime = 'edge';

export default function handler(request: Request): Response {
  const geo = geolocation(request);

  return new Response(
    JSON.stringify({
      country: geo.country ?? null,
      region: geo.region ?? null,
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  );
}
import { geolocation } from '@vercel/functions';

export default {
  fetch(request: Request) {
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
  },
};
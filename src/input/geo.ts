export interface GeoHint {
  country: string | null;
  region: string | null;
}

const fallback: GeoHint = { country: null, region: null };

export async function fetchGeoHint(): Promise<GeoHint> {
  try {
    const res = await fetch('/api/geo');
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      country: data.country ?? null,
      region: data.region ?? null,
    };
  } catch {
    return fallback;
  }
}

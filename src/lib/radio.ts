const BASE_URL = 'https://de1.api.radio-browser.info/json';
export const INITIAL_GLOBAL_STATION_LIMIT = 600;
export const MAX_GLOBAL_STATION_LIMIT = 2500;
export const GLOBAL_STATION_INCREMENT = 300;
export const GLOBAL_STATION_REFRESH_MS = 1000 * 60 * 10;
const COUNTRY_STATION_LIMIT = 450;
const CACHE_TTL_MS = GLOBAL_STATION_REFRESH_MS;
export const MAP_STATION_LIMIT = 120;

export type RadioStation = {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string;
  country?: string;
  state?: string;
  subcountry?: string;
  favicon?: string;
  tags?: string;
  language?: string;
  codec?: string;
  bitrate?: number;
  clickcount?: number;
  votes?: number;
  geo_lat?: number | null;
  geo_long?: number | null;
};

type CacheEntry = {
  expiresAt: number;
  data: RadioStation[];
};

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<RadioStation[]>>();

const getCacheKey = (params: URLSearchParams) => params.toString();

const fetchStations = async (params: URLSearchParams): Promise<RadioStation[]> => {
  const cacheKey = getCacheKey(params);
  const cached = responseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inflight = inflightRequests.get(cacheKey);

  if (inflight) {
    return inflight;
  }

  const request = fetch(`${BASE_URL}/stations/search?${params.toString()}`)
    .then(async (res) => {
      const data = await res.json();
      const stations = Array.isArray(data) ? data : [];

      responseCache.set(cacheKey, {
        data: stations,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return stations;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);

  return request;
};

export async function getGlobalStations(
  limit = INITIAL_GLOBAL_STATION_LIMIT
): Promise<RadioStation[]> {
  const normalizedLimit = Math.max(
    INITIAL_GLOBAL_STATION_LIMIT,
    Math.min(MAX_GLOBAL_STATION_LIMIT, Math.floor(limit))
  );

  return fetchStations(
    new URLSearchParams({
      limit: String(normalizedLimit),
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
    })
  );
}

export async function getCountryStations(
  country: string
): Promise<RadioStation[]> {
  return fetchStations(
    new URLSearchParams({
      country,
      limit: String(COUNTRY_STATION_LIMIT),
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
    })
  );
}

export async function getMapStations(): Promise<RadioStation[]> {
  return fetchStations(
    new URLSearchParams({
      limit: String(MAP_STATION_LIMIT),
      hidebroken: 'true',
      has_geo_info: 'true',
      order: 'clickcount',
      reverse: 'true',
    })
  );
}

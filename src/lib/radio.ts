const BASE_URL = 'https://de1.api.radio-browser.info/json';
const STATION_LIMIT = 2500;
export const MAP_STATION_LIMIT = 160;

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

const fetchStations = async (params: URLSearchParams): Promise<RadioStation[]> => {
  const res = await fetch(`${BASE_URL}/stations/search?${params.toString()}`);

  const data = await res.json();

  return Array.isArray(data) ? data : [];
};

export async function getStations(): Promise<RadioStation[]> {
  return fetchStations(
    new URLSearchParams({
      limit: String(STATION_LIMIT),
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

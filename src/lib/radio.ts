// Client for the public radio-browser.info directory.
const SERVERS = ['de1', 'de2'];

export type RadioStation = {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  favicon?: string;
  tags?: string;
  language?: string;
  clickcount?: number;
  geo_lat?: number | null;
  geo_long?: number | null;
};

export type CountryRef = { name: string; code?: string };

// Natural Earth (globe) names that don't substring-match radio-browser's names.
const COUNTRY_CODES: Record<string, string> = {
  'United States of America': 'US', 'United Kingdom': 'GB', Russia: 'RU',
  'South Korea': 'KR', 'North Korea': 'KP', Vietnam: 'VN', Laos: 'LA',
  'Dem. Rep. Congo': 'CD', Congo: 'CG', 'Bosnia and Herz.': 'BA',
  'Central African Rep.': 'CF', 'Dominican Rep.': 'DO', 'S. Sudan': 'SS',
  'Eq. Guinea': 'GQ', "Côte d'Ivoire": 'CI', 'Solomon Is.': 'SB',
  'Falkland Is.': 'FK', eSwatini: 'SZ', 'Timor-Leste': 'TL', Palestine: 'PS',
  Macedonia: 'MK', Czechia: 'CZ', Kosovo: 'XK', 'N. Cyprus': 'CY',
  'W. Sahara': 'EH', Somaliland: 'SO', Iran: 'IR', Syria: 'SY', Bolivia: 'BO',
  Tanzania: 'TZ', Venezuela: 'VE', Moldova: 'MD', Taiwan: 'TW',
  Netherlands: 'NL', Philippines: 'PH', Bahamas: 'BS', Gambia: 'GM',
};

export const countryRef = (name: string): CountryRef => ({ name, code: COUNTRY_CODES[name] });

const requests = new Map<string, Promise<RadioStation[]>>();

async function request(query: string) {
  for (const [i, server] of SERVERS.entries()) {
    try {
      // A stalled mirror shouldn't hang the app: give up after 15s and try the next one.
      const last = i === SERVERS.length - 1;
      const res = await fetch(`https://${server}.api.radio-browser.info/json/stations/search?${query}`, {
        signal: last ? undefined : AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RadioStation[] = await res.json();
      return data.filter((s) => s.name?.trim() && (s.url_resolved || s.url));
    } catch (err) {
      if (i === SERVERS.length - 1) throw err;
    }
  }
  return [];
}

/** Cached + de-duplicated search; identical concurrent queries share one request. */
function search(params: Record<string, string | number>) {
  const query = new URLSearchParams({
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString();

  let pending = requests.get(query);
  if (!pending) {
    pending = request(query).catch((err) => {
      requests.delete(query);
      throw err;
    });
    requests.set(query, pending);
  }
  return pending;
}

// The directory doesn't gzip, so stations arrive in pages: a small fast one first, then the rest.
export const getGeoStations = (offset: number, limit: number) => search({ has_geo_info: 'true', offset, limit });
export const getCountryStations = ({ name, code }: CountryRef) =>
  search({ ...(code ? { countrycode: code } : { country: name }), limit: 400 });
export const searchByName = (name: string) => search({ name, limit: 60 });

export const streamUrl = (s: RadioStation) => s.url_resolved || s.url;
export const hasGeo = (s: RadioStation) => typeof s.geo_lat === 'number' && typeof s.geo_long === 'number';
export const placeOf = (s: RadioStation) => [s.state, s.country].filter(Boolean).join(', ');

export const inCountry = (s: RadioStation, { name, code }: CountryRef) =>
  code ? s.countrycode?.toUpperCase() === code : !!s.country?.toLowerCase().includes(name.toLowerCase());

export const matches = (s: RadioStation, query: string) =>
  [s.name, s.country, s.state, s.tags, s.language].some((v) => v?.toLowerCase().includes(query));

export const dedupe = (stations: RadioStation[]) => {
  const seen = new Set<string>();
  return stations.filter((s) => !seen.has(s.stationuuid) && !!seen.add(s.stationuuid));
};

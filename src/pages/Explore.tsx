import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import FolderStations from '../components/FolderStations';
import Globe from '../components/Globe';
import Icon, { type IconName } from '../components/Icon';
import StationList from '../components/StationList';
import { useApp } from '../context';
import {
  countryRef,
  dedupe,
  getCountryStations,
  getGeoStations,
  hasGeo,
  inCountry,
  matches,
  searchByName,
  type CountryRef,
  type RadioStation,
} from '../lib/radio';
import type { Season } from '../lib/themes';

type Tab = 'here' | 'search' | 'saved';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'here', label: 'Nearby', icon: 'pin' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
];

export default function Explore({ season }: { season: Season }) {
  const { player, notify } = useApp();
  const [geo, setGeo] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<CountryRef | null>(null);
  const [local, setLocal] = useState<{ name: string; list: RadioStation[] } | null>(null);
  const [tab, setTab] = useState<Tab>('here');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let live = true;
    getGeoStations(0, 250)
      .then((first) => {
        if (!live) return;
        setGeo(first);
        setLoading(false);
        return getGeoStations(250, 750).then((rest) => live && setGeo((list) => dedupe([...list, ...rest])));
      })
      .catch(() => live && notify('Could not reach the radio directory. Try again shortly.', 'error'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [notify]);

  useEffect(() => {
    if (!country) return;
    let live = true;
    getCountryStations(country)
      .catch(() => [])
      .then((list) => live && setLocal({ name: country.name, list }));
    return () => {
      live = false;
    };
  }, [country]);

  const countryList = country && local?.name === country.name ? local.list : null;
  const mapStations = useMemo(
    () => (countryList ? dedupe([...geo, ...countryList.filter(hasGeo)]) : geo),
    [geo, countryList],
  );
  const here = useMemo(
    () => (!country ? geo : countryList?.length ? countryList : geo.filter((s) => inCountry(s, country))),
    [country, countryList, geo],
  );
  const pool = useMemo(() => (countryList ? dedupe([...countryList, ...geo]) : geo), [countryList, geo]);

  const selectCountry = useCallback((name: string | null) => {
    setCountry((current) => (!name || current?.name === name ? null : countryRef(name)));
    setTab('here');
    if (name) setSheetOpen(true);
  }, []);

  return (
    <>
      <Globe
        active={player.station}
        country={country?.name}
        onCountry={selectCountry}
        onStation={player.play}
        stations={mapStations}
        theme={season}
      />

      <aside className={sheetOpen ? 'panel explore-panel is-open' : 'panel explore-panel'}>
        <button
          aria-expanded={sheetOpen}
          aria-label="Toggle station panel"
          className="sheet-handle"
          onClick={() => setSheetOpen((open) => !open)}
          type="button"
        />
        <header className="place">
          <span className="place-count">{loading ? '…' : here.length}</span>
          <div>
            <p className="eyebrow">{country ? 'Tuned to' : 'Now exploring'}</p>
            <h1>{country?.name ?? 'The whole world'}</h1>
          </div>
          {country && (
            <button aria-label="Back to the whole world" className="icon-btn" onClick={() => selectCountry(null)} type="button">
              <Icon name="close" />
            </button>
          )}
        </header>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              aria-selected={tab === t.id}
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSheetOpen(true);
              }}
              role="tab"
              type="button"
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel-scroll">
          {tab === 'here' && (
            <StationList
              empty="No stations are broadcasting from here yet."
              key={country?.name ?? 'world'}
              loading={loading || (!!country && !countryList)}
              stations={here}
            />
          )}
          {tab === 'search' && <SearchTab pool={pool} />}
          {tab === 'saved' && <SavedTab />}
        </div>
      </aside>
    </>
  );
}

function SearchTab({ pool }: { pool: RadioStation[] }) {
  const [text, setText] = useState('');
  const query = useDeferredValue(text.trim().toLowerCase());
  const [remote, setRemote] = useState({ query: '', list: [] as RadioStation[] });

  // Local matches show instantly; the directory is queried once typing settles.
  useEffect(() => {
    if (query.length < 3) return;
    const timer = setTimeout(() => {
      searchByName(query)
        .then((list) => setRemote({ query, list }))
        .catch(() => setRemote({ query, list: [] }));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(
    () =>
      query
        ? dedupe([...pool.filter((s) => matches(s, query)), ...(remote.query === query ? remote.list : [])])
        : [],
    [pool, query, remote],
  );

  return (
    <>
      <label className="search">
        <Icon name="search" />
        <input
          aria-label="Search stations"
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="Station, city, genre or language"
          type="search"
          value={text}
        />
      </label>
      {query ? (
        <StationList
          empty={`Nothing on the dial for “${text.trim()}”.`}
          key={query}
          loading={query.length >= 3 && remote.query !== query}
          stations={results}
        />
      ) : (
        <p className="list-note">Try “jazz”, “Tokyo”, “lofi” or “BBC”.</p>
      )}
    </>
  );
}

function SavedTab() {
  const { user, library, requireAuth } = useApp();
  const [picked, setPicked] = useState<string>();
  const folder = library.folders.find((f) => f.id === picked) ?? library.folders[0];

  if (!user) {
    return (
      <div className="cta">
        <p className="muted">Sign in to keep favourite stations in folders and replay them anywhere.</p>
        <div className="row">
          <button className="btn" onClick={() => requireAuth('signup')} type="button">
            Create account
          </button>
          <button className="btn ghost" onClick={() => requireAuth('login')} type="button">
            Sign in
          </button>
        </div>
      </div>
    );
  }
  if (library.loading) return <p className="list-note">Opening your library…</p>;
  if (!folder) return <p className="list-note">No folders yet. Press the bookmark on any station to start one.</p>;

  return (
    <>
      <div className="chips">
        {library.folders.map((f) => (
          <button aria-pressed={f.id === folder.id} key={f.id} onClick={() => setPicked(f.id)} type="button">
            {f.name} <small>{f.stationCount}</small>
          </button>
        ))}
      </div>
      <FolderStations folderId={folder.id} />
    </>
  );
}

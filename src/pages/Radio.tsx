import {
  type ChangeEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Box, Fade, Modal, TextField } from '@mui/material';
import type { FolderSummary, SavedStation, SaveStationInput } from '../App';
import type { AuthMode } from '../components/AuthModal';
import WorldMap from '../components/WorldMap';
import {
  MAP_STATION_LIMIT,
  getMapStations,
  getStations,
  type RadioStation,
} from '../lib/radio';

type PanelType = 'browse' | 'explore' | 'favorites' | null;

type RadioProps = {
  folders: FolderSummary[];
  getSavedStations: (folderId: string) => SavedStation[];
  loadingSavedFolderId: (folderId: string) => boolean;
  onEnsureSavedStations: (folderId: string, force?: boolean) => Promise<unknown>;
  onOpenFolders: () => void;
  onSaveStation: (
    folderId: string,
    station: SaveStationInput
  ) => Promise<{ ok: boolean; error?: string }>;
  onRequireAuth: (mode: AuthMode) => void;
  token: string | null;
};

const MAX_DEFAULT_BROWSE_RESULTS = 180;
const MAX_MAP_MARKERS = 96;
const MAX_MARKERS_PER_COUNTRY = 2;
const MAX_SELECTED_COUNTRY_MARKERS = 10;

const stationHasCoordinates = (station: RadioStation) =>
  typeof station.geo_lat === 'number' && typeof station.geo_long === 'number';

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const buildMapStationSample = (
  stations: RadioStation[],
  selectedCountry: string,
  activeStationId?: string
) => {
  const byCountry = new Map<string, RadioStation[]>();

  for (const station of stations) {
    const countryKey = normalize(station.country) || 'unknown';
    const group = byCountry.get(countryKey);

    if (group) {
      group.push(station);
    } else {
      byCountry.set(countryKey, [station]);
    }
  }

  const chosen = new Map<string, RadioStation>();
  const selectedCountryKey = normalize(selectedCountry);

  if (selectedCountryKey && byCountry.has(selectedCountryKey)) {
    for (const station of byCountry.get(selectedCountryKey)!.slice(
      0,
      MAX_SELECTED_COUNTRY_MARKERS
    )) {
      chosen.set(station.stationuuid, station);
    }
  }

  for (const group of byCountry.values()) {
    for (const station of group.slice(0, MAX_MARKERS_PER_COUNTRY)) {
      if (chosen.size >= MAX_MAP_MARKERS) {
        break;
      }

      chosen.set(station.stationuuid, station);
    }
  }

  if (chosen.size < MAX_MAP_MARKERS) {
    for (const station of stations) {
      if (chosen.size >= MAX_MAP_MARKERS) {
        break;
      }

      chosen.set(station.stationuuid, station);
    }
  }

  if (activeStationId) {
    const activeStation = stations.find(
      (station) => station.stationuuid === activeStationId
    );

    if (activeStation) {
      chosen.set(activeStation.stationuuid, activeStation);
    }
  }

  return Array.from(chosen.values());
};

export default function Radio({
  folders,
  getSavedStations,
  loadingSavedFolderId,
  onEnsureSavedStations,
  onOpenFolders,
  onSaveStation,
  onRequireAuth,
  token,
}: RadioProps) {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [mapStations, setMapStations] = useState<RadioStation[]>([]);
  const [filtered, setFiltered] = useState<RadioStation[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeStationId, setActiveStationId] = useState('');
  const [nowPlayingStation, setNowPlayingStation] = useState<RadioStation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingStations, setLoadingStations] = useState(true);
  const [notice, setNotice] = useState('');
  const [openPanel, setOpenPanel] = useState<PanelType>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const activeStation =
    filtered.find((station) => station.stationuuid === activeStationId) ??
    stations.find((station) => station.stationuuid === activeStationId) ??
    filtered[0] ??
    stations[0] ??
    null;
  const displayStation = nowPlayingStation ?? activeStation;
  const stationToSave = displayStation ?? activeStation;
  const savedStations = selectedFolder ? getSavedStations(selectedFolder) : [];
  const loadingSaved = selectedFolder ? loadingSavedFolderId(selectedFolder) : false;

  const trimmedSearchTerm = deferredSearchTerm.trim();
  const browseStations =
    trimmedSearchTerm || selectedCountry
      ? filtered
      : filtered.slice(0, MAX_DEFAULT_BROWSE_RESULTS);
  const visibleMapStations = buildMapStationSample(
    mapStations,
    selectedCountry,
    activeStation?.stationuuid
  );
  const areaName =
    displayStation?.state?.trim() ||
    displayStation?.subcountry?.trim() ||
    selectedCountry ||
    displayStation?.country?.trim() ||
    'Global';
  const areaCountry =
    selectedCountry || displayStation?.country?.trim() || 'Worldwide';

  const exploreStations = stations
    .filter((station) => {
      if (displayStation?.state) {
        return (
          normalize(station.state) === normalize(displayStation.state) ||
          normalize(station.subcountry) === normalize(displayStation.state)
        );
      }

      if (selectedCountry) {
        return normalize(station.country).includes(normalize(selectedCountry));
      }

      if (displayStation?.country) {
        return normalize(station.country).includes(normalize(displayStation.country));
      }

      return true;
    })
    .filter((station) => station.url && station.name)
    .slice(0, 18);

  const loadStations = async () => {
    try {
      setLoadingStations(true);
      const [stationData, mapData] = await Promise.all([
        getStations(),
        getMapStations(),
      ]);
      const valid = stationData.filter((station) => station.url && station.name);
      const validMapStations = mapData
        .filter(
          (station) =>
            station.url && station.name && stationHasCoordinates(station)
        )
        .slice(0, MAP_STATION_LIMIT);

      setStations(valid);
      setMapStations(
        validMapStations.length > 0
          ? validMapStations
          : valid.filter(stationHasCoordinates).slice(0, MAP_STATION_LIMIT)
      );
      setFiltered(valid);
      setActiveStationId((current) => current || valid[0]?.stationuuid || '');
    } catch (err) {
      console.error('Failed to load stations', err);
      setNotice('Could not load live stations right now.');
      setMapStations([]);
    } finally {
      setLoadingStations(false);
    }
  };

  const playStation = async (station: RadioStation) => {
    const streamUrl = station.url_resolved || station.url;

    if (!streamUrl) {
      setNotice('This station does not have a playable stream URL.');
      return;
    }

    setActiveStationId(station.stationuuid);
    setNowPlayingStation(station);
    setNotice('');

    if (audioRef.current) {
      audioRef.current.src = streamUrl;

      try {
        await audioRef.current.play();
      } catch (err) {
        console.error('Playback failed', err);
        setNotice('Playback failed for this stream.');
      }
    }
  };

  const saveStation = async (station: RadioStation) => {
    if (!token) {
      setNotice('Sign in to save stations into folders.');
      onRequireAuth('signup');
      return;
    }

    if (!selectedFolder) {
      setNotice('Create a folder first, then save stations into it.');
      setOpenPanel('favorites');
      return;
    }

    if (!station?.url || !station?.name || savingId === station.stationuuid) {
      return;
    }

    setSavingId(station.stationuuid);

    try {
      const result = await onSaveStation(selectedFolder, {
        name: station.name,
        streamUrl: station.url_resolved || station.url,
        country: station.country || null,
        favicon: station.favicon || null,
      });

      if (!result.ok) {
        setNotice(result.error || 'Failed to save station.');

        return;
      }

      setNotice(`Saved ${station.name} to your folder.`);
      setOpenPanel('favorites');
    } finally {
      setSavingId(null);
    }
  };

  useEffect(() => {
    void loadStations();
  }, []);

  useEffect(() => {
    if (!token) {
      setSelectedFolder('');
      return;
    }
  }, [token]);

  useEffect(() => {
    if (!token || !selectedFolder) {
      return;
    }

    void onEnsureSavedStations(selectedFolder);
  }, [selectedFolder, token]);

  useEffect(() => {
    setSelectedFolder((current) => {
      if (current && folders.some((folder) => folder.id === current)) {
        return current;
      }

      return folders[0]?.id ?? '';
    });
  }, [folders]);

  useEffect(() => {
    startTransition(() => {
      const query = deferredSearchTerm.trim().toLowerCase();

      const nextFiltered = stations.filter((station) => {
        const matchesCountry = selectedCountry
          ? station.country
              ?.toLowerCase()
              .includes(selectedCountry.toLowerCase()) ?? false
          : true;

        const matchesQuery = query
          ? [
              station.name,
              station.country,
              station.state,
              station.subcountry,
              station.tags,
              station.language,
            ]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(query))
          : true;

        return matchesCountry && matchesQuery;
      });

      setFiltered(nextFiltered);
      setActiveStationId((current) => {
        if (nextFiltered.some((station) => station.stationuuid === current)) {
          return current;
        }

        return nextFiltered[0]?.stationuuid ?? '';
      });
    });
  }, [deferredSearchTerm, selectedCountry, stations]);

  const modalTitle =
    // Old modal labels: "Stations in ...", "Favorites", "Browse Stations"
    openPanel === 'explore'
      ? `${areaName} on the dial`
      : openPanel === 'favorites'
        ? 'Saved Signals'
        : 'Tune Finder';
  // Old eyebrow labels: "Area explorer", "Save and revisit", "Manual browsing"
  const modalEyebrow =
    openPanel === 'explore'
      ? 'Local frequencies'
      : openPanel === 'favorites'
        ? 'Your saved dial'
        : 'Station search';

  return (
    <section className="radio-garden-layout">
      <div className="radio-garden-stage">
        <div className="stage-gradient" />

        <div className="stage-topbar">
          <span className="stage-pill">Radio map</span>
          <span className="stage-help">
            Spin the globe. Scroll to tune in closer.
          </span>
        </div>

        <div className="location-card">
          <div className="location-count">
            <strong>{exploreStations.length}</strong>
          </div>
          <div className="location-meta">
            <h2>{areaName}</h2>
            <p>{areaCountry}</p>
          </div>
        </div>

        <div className="now-playing-float">
          <p className="eyebrow">On air now</p>
          <h3>{displayStation?.name || 'Pick a station'}</h3>
          <p className="station-meta">
            {[displayStation?.state, displayStation?.country]
              .filter(Boolean)
              .join(', ') ||
              'Spin the globe and lock onto a signal'}
          </p>

          <div className="floating-player-actions">
            <button
              className="icon-pill primary-button"
              disabled={!activeStation}
              onClick={() => activeStation && void playStation(activeStation)}
              type="button"
            >
              Play
            </button>
            <button
              className="icon-pill ghost-button"
              disabled={!stationToSave || savingId === stationToSave?.stationuuid}
              onClick={() => stationToSave && void saveStation(stationToSave)}
              type="button"
            >
              {token ? 'Favorite' : 'Sign in'}
            </button>
          </div>

          <audio className="audio-player compact-audio" controls ref={audioRef} />
        </div>

        <div className="control-dock">
          <button
            className={openPanel === 'explore' ? 'dock-button dock-button-active' : 'dock-button'}
            onClick={() => setOpenPanel((current) => (current === 'explore' ? null : 'explore'))}
            type="button"
          >
            Nearby
          </button>
          <button
            className={openPanel === 'favorites' ? 'dock-button dock-button-active' : 'dock-button'}
            onClick={() => setOpenPanel((current) => (current === 'favorites' ? null : 'favorites'))}
            type="button"
          >
            Favorites
          </button>
          <button
            className={openPanel === 'browse' ? 'dock-button dock-button-active' : 'dock-button'}
            onClick={() => setOpenPanel((current) => (current === 'browse' ? null : 'browse'))}
            type="button"
          >
            Search
          </button>
        </div>

        {openPanel && (
          <Modal onClose={() => setOpenPanel(null)} open={Boolean(openPanel)}>
            <Fade in={Boolean(openPanel)}>
              <Box className="stage-modal" role="dialog" aria-modal="true">
                <div className="stage-modal-header">
                  <div>
                    <p className="eyebrow">{modalEyebrow}</p>
                    <h3>{modalTitle}</h3>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => setOpenPanel(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                {openPanel === 'explore' && (
                  <div className="modal-scroller">
                    <p className="support-copy">
                      Tune through stations around {areaName}. If local area data is
                      missing, this list falls back to the wider country signal.
                    </p>

                    <div className="modal-station-list">
                      {exploreStations.map((station) => (
                        <button
                          className="modal-station-item"
                          key={station.stationuuid}
                          onClick={() => {
                            void playStation(station);
                            setOpenPanel(null);
                          }}
                          type="button"
                        >
                          <div>
                            <strong>{station.name}</strong>
                            <span>
                              {[station.state || station.subcountry, station.country]
                                .filter(Boolean)
                                .join(', ') || 'Unknown location'}
                            </span>
                          </div>
                          <span className="modal-pill">
                            {station.clickcount ?? 0} tuned in
                          </span>
                        </button>
                      ))}

                      {exploreStations.length === 0 && (
                        <div className="modal-empty-state">
                          No stations are coming through this area yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {openPanel === 'favorites' && (
                  <div className="modal-scroller">
                    {!token && (
                      <div className="modal-auth-cta">
                        <p>
                          Sign in to save the station on air and build your own late-night library.
                        </p>
                        <div className="inline-actions">
                          <button
                            className="primary-button"
                            onClick={() => onRequireAuth('signup')}
                            type="button"
                          >
                            Create account
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => onRequireAuth('login')}
                            type="button"
                          >
                            Sign in
                          </button>
                        </div>
                      </div>
                    )}

                    {token && (
                      <>
                        <div className="favorites-toolbar">
                          <select
                            className="folder-select"
                            onChange={(event) => setSelectedFolder(event.target.value)}
                            value={selectedFolder}
                          >
                            <option value="">Choose a folder</option>
                            {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                {folder.name}
                              </option>
                            ))}
                          </select>

                          <div className="inline-actions">
                            <button
                              className="primary-button"
                              disabled={!stationToSave || savingId === stationToSave?.stationuuid}
                              onClick={() => stationToSave && void saveStation(stationToSave)}
                              type="button"
                            >
                              {savingId === stationToSave?.stationuuid
                                ? 'Saving...'
                                : 'Save This Station'}
                            </button>
                            <button
                              className="ghost-button"
                              onClick={onOpenFolders}
                              type="button"
                            >
                              Open library
                            </button>
                          </div>
                        </div>

                        {loadingSaved && (
                          <p className="support-copy">Tuning up your saved stations...</p>
                        )}

                        {!loadingSaved && savedStations.length === 0 && (
                          <div className="modal-empty-state">
                            This folder is ready for its first signal.
                          </div>
                        )}

                        {!loadingSaved && savedStations.length > 0 && (
                          <div className="modal-station-list">
                            {savedStations.map((item) => (
                              <button
                                className="modal-station-item"
                                key={item.station?.id}
                                onClick={() =>
                                  item.station &&
                                  void playStation({
                                    stationuuid: item.station.id,
                                    name: item.station.name,
                                    url: item.station.streamUrl,
                                    country: item.station.country || undefined,
                                    favicon: item.station.favicon || undefined,
                                  })
                                }
                                type="button"
                              >
                                <div>
                                  <strong>{item.station?.name || 'Unknown station'}</strong>
                                  <span>
                                    {item.station?.country || 'Unknown location'}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {openPanel === 'browse' && (
                  <div className="modal-scroller">
                    <div className="browse-toolbar">
                      <TextField
                        className="search-field"
                        label="Search stations"
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setSearchTerm(event.target.value)
                        }
                        placeholder="Search by city, station, country, tag, or language"
                        value={searchTerm}
                      />
                      {trimmedSearchTerm && (
                        <button
                          className="ghost-button"
                          onClick={() => setSearchTerm('')}
                          type="button"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <p className="support-copy">
                      {trimmedSearchTerm
                        ? `${filtered.length} stations on the dial`
                        : selectedCountry
                          ? `${filtered.length} stations from ${selectedCountry}`
                          : `Showing ${visibleMapStations.length} featured dots on the globe. Search a city, country, or station name to browse the full station list.`}
                    </p>

                    <div className="modal-station-list">
                      {browseStations.map((station) => (
                        <div className="modal-station-item" key={station.stationuuid}>
                          <div>
                            <strong>{station.name}</strong>
                            <span>
                              {[
                                station.state || station.subcountry,
                                station.country,
                                station.language,
                              ]
                                .filter(Boolean)
                                .join(' / ') || 'Unknown location'}
                            </span>
                          </div>
                          <div className="inline-actions">
                            <button
                              className="primary-button"
                              onClick={() => {
                                void playStation(station);
                                setOpenPanel(null);
                              }}
                              type="button"
                            >
                              Play
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() => void saveStation(station)}
                              type="button"
                            >
                              {token ? 'Save' : 'Sign in'}
                            </button>
                          </div>
                        </div>
                      ))}

                      {!loadingStations && browseStations.length === 0 && (
                        <div className="modal-empty-state">
                          No stations are coming through for that search yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Box>
            </Fade>
          </Modal>
        )}

        {notice && <div className="stage-toast">{notice}</div>}

        <WorldMap
          activeStationId={activeStation?.stationuuid}
          onCountryClick={(country) => {
            setSelectedCountry((current) => (current === country ? '' : country));
            setOpenPanel('explore');
          }}
          onStationSelect={(station) => {
            setActiveStationId(station.stationuuid);
            void playStation(station);
          }}
          selectedCountry={selectedCountry}
          stations={visibleMapStations}
        />
      </div>
    </section>
  );
}

import {
  startTransition,
  type ChangeEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Fade, Modal, TextField } from '@mui/material';
import type { FolderSummary, SavedStation, SaveStationInput } from '../App';
import type { AuthMode } from '../components/AuthModal';
import WorldMap from '../components/WorldMap';
import {
  GLOBAL_STATION_INCREMENT,
  GLOBAL_STATION_REFRESH_MS,
  INITIAL_GLOBAL_STATION_LIMIT,
  MAP_STATION_LIMIT,
  MAX_GLOBAL_STATION_LIMIT,
  getCountryStations,
  getGlobalStations,
  getMapStations,
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

const MAX_BROWSE_PAGE_SIZE = 40;
const MAX_EXPLORE_PAGE_SIZE = 40;
const MAX_MAP_MARKERS = 96;
const MAX_MARKERS_PER_COUNTRY = 2;
const MAX_SELECTED_COUNTRY_MARKERS = 10;

const stationHasCoordinates = (station: RadioStation) =>
  typeof station.geo_lat === 'number' && typeof station.geo_long === 'number';

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const sanitizeStations = (stations: RadioStation[]) =>
  stations.filter((station) => station.url && station.name);

const haveSameStationOrder = (
  current: RadioStation[],
  next: RadioStation[]
) =>
  current.length === next.length &&
  current.every((station, index) => station.stationuuid === next[index]?.stationuuid);

const filterStationsByContext = (
  stations: RadioStation[],
  selectedCountry: string,
  searchTerm: string
) => {
  const query = searchTerm.trim().toLowerCase();

  return stations.filter((station) => {
    const matchesCountry = selectedCountry
      ? station.country?.toLowerCase().includes(selectedCountry.toLowerCase()) ?? false
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
};

const filterStationsByCountry = (
  stations: RadioStation[],
  selectedCountry: string
) => {
  const countryKey = normalize(selectedCountry);

  if (!countryKey) {
    return [];
  }

  return stations.filter((station) =>
    normalize(station.country).includes(countryKey)
  );
};

const mergeUniqueStations = (
  primary: RadioStation[],
  secondary: RadioStation[]
) => {
  const seen = new Set<string>();
  const merged: RadioStation[] = [];

  for (const station of [...primary, ...secondary]) {
    if (!station.stationuuid || seen.has(station.stationuuid)) {
      continue;
    }

    seen.add(station.stationuuid);
    merged.push(station);
  }

  return merged;
};

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
    for (const station of byCountry
      .get(selectedCountryKey)!
      .slice(0, MAX_SELECTED_COUNTRY_MARKERS)) {
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
  const [globalStations, setGlobalStations] = useState<RadioStation[]>([]);
  const [countryStations, setCountryStations] = useState<RadioStation[]>([]);
  const [mapStations, setMapStations] = useState<RadioStation[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingSaveStation, setPendingSaveStation] = useState<RadioStation | null>(null);
  const [activeStationId, setActiveStationId] = useState('');
  const [nowPlayingStation, setNowPlayingStation] = useState<RadioStation | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingStations, setLoadingStations] = useState(true);
  const [loadingCountryStations, setLoadingCountryStations] = useState(false);
  const [notice, setNotice] = useState('');
  const [openPanel, setOpenPanel] = useState<PanelType>(null);
  const [exploreVisibleCount, setExploreVisibleCount] = useState(
    MAX_EXPLORE_PAGE_SIZE
  );
  const [browseVisibleCount, setBrowseVisibleCount] = useState(
    MAX_BROWSE_PAGE_SIZE
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const countryCacheRef = useRef<Record<string, RadioStation[]>>({});
  const globalStationLimitRef = useRef(INITIAL_GLOBAL_STATION_LIMIT);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const trimmedSearchTerm = deferredSearchTerm.trim();
  const selectedCountryKey = normalize(selectedCountry);

  const fallbackCountryStations = useMemo(
    () => filterStationsByCountry(globalStations, selectedCountry),
    [globalStations, selectedCountry]
  );
  const visibleCountryStations = useMemo(
    () =>
      selectedCountryKey
        ? countryStations.length > 0
          ? countryStations
          : fallbackCountryStations
        : [],
    [countryStations, fallbackCountryStations, selectedCountryKey]
  );
  const stations = useMemo(
    () => (selectedCountryKey ? visibleCountryStations : globalStations),
    [globalStations, selectedCountryKey, visibleCountryStations]
  );
  const filtered = useMemo(
    () => filterStationsByContext(stations, selectedCountry, deferredSearchTerm),
    [deferredSearchTerm, selectedCountry, stations]
  );
  const activeStation =
    filtered.find((station) => station.stationuuid === activeStationId) ??
    stations.find((station) => station.stationuuid === activeStationId) ??
    filtered[0] ??
    stations[0] ??
    null;
  const playerStation = nowPlayingStation ?? activeStation;
  const selectedCountryStation =
    filtered.find((station) => station.stationuuid === activeStationId) ??
    filtered[0] ??
    null;
  const contextStation = selectedCountry ? selectedCountryStation : playerStation;
  const stationToSave = pendingSaveStation ?? playerStation ?? activeStation;
  const savedStations = selectedFolder ? getSavedStations(selectedFolder) : [];
  const loadingSaved = selectedFolder ? loadingSavedFolderId(selectedFolder) : false;
  const countryMapStations = useMemo(
    () =>
      selectedCountryKey
        ? visibleCountryStations.filter(stationHasCoordinates)
        : [],
    [selectedCountryKey, visibleCountryStations]
  );
  const visibleMapStations = useMemo(
    () =>
      buildMapStationSample(
        mergeUniqueStations(countryMapStations, mapStations),
        selectedCountry,
        activeStationId
      ),
    [activeStationId, countryMapStations, mapStations, selectedCountry]
  );
  const browseSourceStations = useMemo(
    () => filtered,
    [filtered]
  );
  const browseStations = browseSourceStations.slice(0, browseVisibleCount);
  const exploreSourceStations = useMemo(
    () =>
      stations
        .filter((station) => {
          if (selectedCountry) {
            return normalize(station.country).includes(normalize(selectedCountry));
          }

          if (contextStation?.state) {
            return (
              normalize(station.state) === normalize(contextStation.state) ||
              normalize(station.subcountry) === normalize(contextStation.state)
            );
          }

          if (contextStation?.country) {
            return normalize(station.country).includes(
              normalize(contextStation.country)
            );
          }

          return true;
        })
        .filter((station) => station.url && station.name),
    [contextStation?.country, contextStation?.state, selectedCountry, stations]
  );
  const exploreStations = exploreSourceStations.slice(0, exploreVisibleCount);
  const areaName =
    contextStation?.state?.trim() ||
    contextStation?.subcountry?.trim() ||
    selectedCountry ||
    contextStation?.country?.trim() ||
    'Global';
  const areaCountry =
    selectedCountry || contextStation?.country?.trim() || 'Worldwide';
  const canLoadMoreExplore = exploreStations.length < exploreSourceStations.length;
  const canLoadMoreBrowse = browseStations.length < browseSourceStations.length;

  const loadMapStations = useCallback(async () => {
    try {
      const mapData = await getMapStations();
      const validMapStations = sanitizeStations(mapData)
        .filter(stationHasCoordinates)
        .slice(0, MAP_STATION_LIMIT);

      setMapStations(validMapStations);
    } catch (err) {
      console.error('Failed to load map stations', err);
      setMapStations([]);
    }
  }, []);

  const loadGlobalStations = useCallback(
    async (
      requestedLimit = INITIAL_GLOBAL_STATION_LIMIT,
      { background = false }: { background?: boolean } = {}
    ) => {
      const nextLimit = Math.min(MAX_GLOBAL_STATION_LIMIT, requestedLimit);

      if (!background) {
        setLoadingStations(true);
      }

      try {
        const stationData = await getGlobalStations(nextLimit);
        const validStations = sanitizeStations(stationData);

        globalStationLimitRef.current = Math.max(
          globalStationLimitRef.current,
          nextLimit
        );

        startTransition(() => {
          setGlobalStations((current) =>
            haveSameStationOrder(current, validStations) ? current : validStations
          );
          setMapStations((current) =>
            current.length > 0
              ? current
              : validStations
                  .filter(stationHasCoordinates)
                  .slice(0, MAP_STATION_LIMIT)
          );
          setActiveStationId((current) => current || validStations[0]?.stationuuid || '');
        });
      } catch (err) {
        console.error('Failed to load stations', err);
        if (!background) {
          setNotice('Could not load live stations right now.');
        }
      } finally {
        if (!background) {
          setLoadingStations(false);
        }
      }
    },
    []
  );

  const playStation = useCallback(async (station: RadioStation) => {
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
  }, []);

  const confirmSaveStation = useCallback(
    async (station: RadioStation, folderIdOverride?: string) => {
      const targetFolderId = folderIdOverride ?? selectedFolder;

      if (!token) {
        setNotice('Sign in to save stations into folders.');
        onRequireAuth('signup');
        return;
      }

      if (!targetFolderId) {
        setNotice('Create a folder first, then save stations into it.');
        setOpenPanel('favorites');
        return;
      }

      if (!station?.url || !station?.name || savingId === station.stationuuid) {
        return;
      }

      setSavingId(station.stationuuid);

      try {
        const result = await onSaveStation(targetFolderId, {
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
        setPendingSaveStation(null);
        setOpenPanel(null);
      } finally {
        setSavingId(null);
      }
    },
    [onRequireAuth, onSaveStation, savingId, selectedFolder, token]
  );

  const promptSaveStation = useCallback(
    (station: RadioStation) => {
      if (!token) {
        setNotice('Sign in to save stations into folders.');
        onRequireAuth('signup');
        return;
      }

      if (folders.length === 0) {
        setNotice('No folders created yet. Create one first to save stations.');
        setPendingSaveStation(station);
        setOpenPanel('favorites');
        return;
      }

      if (folders.length === 1) {
        setSelectedFolder(folders[0].id);
        void confirmSaveStation(station, folders[0].id);
        return;
      }

      setSelectedFolder((current) => {
        if (current && folders.some((folder) => folder.id === current)) {
          return current;
        }

        return folders[0]?.id ?? '';
      });
      setPendingSaveStation(station);
      setNotice('');
      setOpenPanel('favorites');
    },
    [confirmSaveStation, folders, onRequireAuth, token]
  );

  const handleOpenLibrary = useCallback(() => {
    setOpenPanel(null);
    setPendingSaveStation(null);
    onOpenFolders();
  }, [onOpenFolders]);

  const handleClearSelection = useCallback(() => {
    setSelectedCountry('');
    setOpenPanel(null);
  }, []);

  const handleCountryClick = useCallback((country: string) => {
    setSelectedCountry((current) => (current === country ? '' : country));
    setOpenPanel('explore');
  }, []);

  const handleStationSelect = useCallback(
    (station: RadioStation) => {
      setActiveStationId(station.stationuuid);
      void playStation(station);
    },
    [playStation]
  );

  useEffect(() => {
    void loadMapStations();
    void loadGlobalStations();
  }, [loadGlobalStations, loadMapStations]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNextExpansion = () => {
      if (cancelled || globalStationLimitRef.current >= MAX_GLOBAL_STATION_LIMIT) {
        return;
      }

      timeoutId = window.setTimeout(async () => {
        if (cancelled) {
          return;
        }

        if (document.visibilityState !== 'visible') {
          scheduleNextExpansion();
          return;
        }

        const nextLimit = Math.min(
          MAX_GLOBAL_STATION_LIMIT,
          globalStationLimitRef.current + GLOBAL_STATION_INCREMENT
        );

        await loadGlobalStations(nextLimit, { background: true });

        if (!cancelled) {
          scheduleNextExpansion();
        }
      }, GLOBAL_STATION_REFRESH_MS);
    };

    scheduleNextExpansion();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [loadGlobalStations]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedCountryKey) {
      setCountryStations([]);
      setLoadingCountryStations(false);
      return () => {
        cancelled = true;
      };
    }

    const cachedStations = countryCacheRef.current[selectedCountryKey];

    if (cachedStations) {
      setCountryStations(cachedStations);
      setLoadingCountryStations(false);
      return () => {
        cancelled = true;
      };
    }

    setCountryStations([]);
    setLoadingCountryStations(true);

    void getCountryStations(selectedCountry)
      .then((stationData) => {
        if (cancelled) {
          return;
        }

        const validStations = sanitizeStations(stationData);
        countryCacheRef.current[selectedCountryKey] = validStations;
        setCountryStations(validStations);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }

        console.error('Failed to load country stations', err);
        setNotice(
          `Could not fully load stations for ${selectedCountry}. Showing available results instead.`
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCountryStations(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCountry, selectedCountryKey]);

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
  }, [onEnsureSavedStations, selectedFolder, token]);

  useEffect(() => {
    setSelectedFolder((current) => {
      if (current && folders.some((folder) => folder.id === current)) {
        return current;
      }

      return folders[0]?.id ?? '';
    });
  }, [folders]);

  useEffect(() => {
    setExploreVisibleCount(MAX_EXPLORE_PAGE_SIZE);
  }, [openPanel, selectedCountry, contextStation?.country, contextStation?.state]);

  useEffect(() => {
    setBrowseVisibleCount(MAX_BROWSE_PAGE_SIZE);
  }, [openPanel, selectedCountry, trimmedSearchTerm]);

  useEffect(() => {
    setActiveStationId((current) => {
      if (filtered.some((station) => station.stationuuid === current)) {
        return current;
      }

      return filtered[0]?.stationuuid ?? stations[0]?.stationuuid ?? '';
    });
  }, [filtered, stations]);

  const modalTitle =
    openPanel === 'explore'
      ? `${areaName} on the dial`
      : openPanel === 'favorites'
        ? 'Saved Signals'
        : 'Tune Finder';
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
          <h3>{playerStation?.name || 'Pick a station'}</h3>
          <p className="station-meta">
            {[playerStation?.state, playerStation?.country]
              .filter(Boolean)
              .join(', ') || 'Spin the globe and lock onto a signal'}
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
              onClick={() => stationToSave && promptSaveStation(stationToSave)}
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
          <Modal
            onClose={() => {
              setOpenPanel(null);
              setPendingSaveStation(null);
            }}
            open={Boolean(openPanel)}
          >
            <Fade in={Boolean(openPanel)}>
              <Box aria-modal="true" className="stage-modal" role="dialog">
                <div className="stage-modal-header">
                  <div>
                    <p className="eyebrow">{modalEyebrow}</p>
                    <h3>{modalTitle}</h3>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setOpenPanel(null);
                      setPendingSaveStation(null);
                    }}
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

                    {loadingCountryStations && selectedCountry && (
                      <p className="support-copy">
                        Loading more stations from {selectedCountry}...
                      </p>
                    )}

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

                      {!loadingStations && exploreStations.length === 0 && (
                        <div className="modal-empty-state">
                          No stations are coming through this area yet.
                        </div>
                      )}

                      {canLoadMoreExplore && (
                        <div className="inline-actions">
                          <button
                            className="ghost-button"
                            onClick={() =>
                              setExploreVisibleCount(
                                (current) => current + MAX_EXPLORE_PAGE_SIZE
                              )
                            }
                            type="button"
                          >
                            Load more stations
                          </button>
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
                          Sign in to save the station on air and build your own late-night
                          library.
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
                        {stationToSave && (
                          <p className="support-copy">
                            Choose a folder for <strong>{stationToSave.name}</strong>.
                          </p>
                        )}

                        <div className="favorites-toolbar">
                          {folders.length > 0 ? (
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
                          ) : (
                            <div className="modal-empty-state">
                              No folders created yet. Create your first folder to save this
                              station.
                            </div>
                          )}

                          <div className="inline-actions">
                            {folders.length > 0 && (
                              <button
                                className="primary-button"
                                disabled={
                                  !selectedFolder ||
                                  !stationToSave ||
                                  savingId === stationToSave?.stationuuid
                                }
                                onClick={() =>
                                  stationToSave && void confirmSaveStation(stationToSave)
                                }
                                type="button"
                              >
                                {savingId === stationToSave?.stationuuid
                                  ? 'Saving...'
                                  : stationToSave
                                    ? `Save ${stationToSave.name}`
                                    : 'Save This Station'}
                              </button>
                            )}
                            <button
                              className="ghost-button"
                              onClick={handleOpenLibrary}
                              type="button"
                            >
                              {folders.length === 0
                                ? 'Create your own folder'
                                : 'Open library'}
                            </button>
                          </div>
                        </div>

                        {loadingSaved && (
                          <p className="support-copy">Tuning up your saved stations...</p>
                        )}

                        {!loadingSaved && folders.length > 0 && savedStations.length === 0 && (
                          <div className="modal-empty-state">
                            This folder is ready for its first signal.
                          </div>
                        )}

                        {!loadingSaved && folders.length > 0 && savedStations.length > 0 && (
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
                          : `Showing ${visibleMapStations.length} featured dots on the globe. Search a city, country, or station name to browse the station list in smaller batches.`}
                    </p>

                    {loadingCountryStations && selectedCountry && (
                      <p className="support-copy">
                        Loading more stations from {selectedCountry}...
                      </p>
                    )}

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
                              onClick={() => promptSaveStation(station)}
                              type="button"
                            >
                              {token ? 'Save' : 'Sign in'}
                            </button>
                          </div>
                        </div>
                      ))}

                      {canLoadMoreBrowse && (
                        <div className="inline-actions">
                          <button
                            className="ghost-button"
                            onClick={() =>
                              setBrowseVisibleCount(
                                (current) => current + MAX_BROWSE_PAGE_SIZE
                              )
                            }
                            type="button"
                          >
                            Load more stations
                          </button>
                        </div>
                      )}

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
          onClearSelection={handleClearSelection}
          onCountryClick={handleCountryClick}
          onStationSelect={handleStationSelect}
          selectedCountry={selectedCountry}
          stations={visibleMapStations}
        />
      </div>
    </section>
  );
}

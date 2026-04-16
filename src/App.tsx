import { useEffect, useState } from 'react';
import AuthModal, { type AuthMode } from './components/AuthModal';
import Folders from './pages/Folders';
import Radio from './pages/Radio';
import { ApiError, apiFetch } from './lib/api';
import { supabase } from './lib/supabase';

type AppAlert = {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
};

export type FolderSummary = {
  id: string;
  name: string;
  stationCount: number;
};

export type SavedStation = {
  station?: {
    id: string;
    name: string;
    streamUrl: string;
    country?: string | null;
    favicon?: string | null;
  };
};

export type SaveStationInput = {
  name: string;
  streamUrl: string;
  country?: string | null;
  favicon?: string | null;
};

const normalizeFolder = (folder: any): FolderSummary => ({
  id: folder.id,
  name: folder.name,
  stationCount: Array.isArray(folder.stations) ? folder.stations.length : 0,
});

const stationMatches = (entry: SavedStation, station: SaveStationInput) =>
  entry.station?.streamUrl === station.streamUrl &&
  entry.station?.name === station.name;

function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('token')
  );
  const [page, setPage] = useState<'folders' | 'radio'>('radio');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authOpen, setAuthOpen] = useState(false);
  const [alert, setAlert] = useState<AppAlert | null>(null);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderStationsById, setFolderStationsById] = useState<
    Record<string, SavedStation[]>
  >({});
  const [folderStationsLoading, setFolderStationsLoading] = useState<
    Record<string, boolean>
  >({});
  const [loadedFolderIds, setLoadedFolderIds] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    const syncToken = (nextToken: string | null) => {
      if (nextToken) {
        localStorage.setItem('token', nextToken);
      } else {
        localStorage.removeItem('token');
      }

      setToken(nextToken);
    };

    void supabase.auth.getSession().then(({ data }) => {
      syncToken(data.session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!alert) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAlert((current) => (current?.id === alert.id ? null : current));
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [alert]);

  const showAlert = (
    message: string,
    tone: AppAlert['tone'] = 'info'
  ) => {
    setAlert({
      id: Date.now(),
      message,
      tone,
    });
  };

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    setToken(null);
    setPage('radio');
    showAlert('Signed out of your listening account.', 'info');
  };

  const handleExpiredSession = () => {
    localStorage.removeItem('token');
    setToken(null);
    setPage('radio');
    showAlert('Your session expired. Please sign in again.', 'info');
  };

  const loadFolders = async () => {
    if (!token) {
      setFolders([]);
      setFolderStationsById({});
      setFolderStationsLoading({});
      setLoadedFolderIds({});
      return;
    }

    try {
      setFoldersLoading(true);
      const data = await apiFetch('/folders');
      const nextFolders = Array.isArray(data) ? data.map(normalizeFolder) : [];
      setFolders(nextFolders);
    } catch (err) {
      console.error('Failed to load folders', err);
      if (err instanceof ApiError && err.status === 401) {
        handleExpiredSession();
      }
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  };

  const loadFolderStations = async (folderId: string, force = false) => {
    if (!token || !folderId) {
      return [];
    }

    if (!force && (loadedFolderIds[folderId] || folderStationsLoading[folderId])) {
      return folderStationsById[folderId] ?? [];
    }

    try {
      setFolderStationsLoading((current) => ({ ...current, [folderId]: true }));
      const data = await apiFetch(`/folder-stations/${folderId}`);
      const nextStations = Array.isArray(data) ? data : [];

      setFolderStationsById((current) => ({
        ...current,
        [folderId]: nextStations,
      }));
      setLoadedFolderIds((current) => ({ ...current, [folderId]: true }));

      return nextStations;
    } catch (err) {
      console.error('Failed to load saved stations', err);
      setFolderStationsById((current) => ({
        ...current,
        [folderId]: [],
      }));
      throw err;
    } finally {
      setFolderStationsLoading((current) => ({ ...current, [folderId]: false }));
    }
  };

  const createFolder = async (name: string) => {
    if (!token) {
      return { ok: false as const, error: 'Sign in to create folders.' };
    }

    const tempId = `temp-folder-${Date.now()}`;
    const optimisticFolder: FolderSummary = {
      id: tempId,
      name,
      stationCount: 0,
    };

    setFolders((current) => [optimisticFolder, ...current]);

    try {
      const created = await apiFetch('/folders', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      const nextFolder = normalizeFolder(created);

      setFolders((current) =>
        current.map((folder) => (folder.id === tempId ? nextFolder : folder))
      );

      return { ok: true as const, folder: nextFolder };
    } catch (err: any) {
      setFolders((current) => current.filter((folder) => folder.id !== tempId));
      return {
        ok: false as const,
        error: err.message || 'Could not create that folder right now.',
      };
    }
  };

  const deleteFolder = async (folderId: string) => {
    const previousFolders = folders;
    const previousStations = folderStationsById[folderId];
    const previousLoaded = loadedFolderIds[folderId];

    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setFolderStationsById((current) => {
      const next = { ...current };
      delete next[folderId];
      return next;
    });
    setLoadedFolderIds((current) => {
      const next = { ...current };
      delete next[folderId];
      return next;
    });

    try {
      await apiFetch(`/folders/${folderId}`, {
        method: 'DELETE',
      });

      return { ok: true as const };
    } catch (err: any) {
      setFolders(previousFolders);
      setFolderStationsById((current) => ({
        ...current,
        ...(previousStations ? { [folderId]: previousStations } : {}),
      }));
      setLoadedFolderIds((current) => ({
        ...current,
        ...(previousLoaded ? { [folderId]: true } : {}),
      }));

      return {
        ok: false as const,
        error: err.message || 'Could not remove that folder right now.',
      };
    }
  };

  const saveStationToFolder = async (
    folderId: string,
    station: SaveStationInput
  ) => {
    if (!token) {
      return { ok: false as const, error: 'Sign in to save stations.' };
    }

    const existingStations = folderStationsById[folderId] ?? [];

    if (existingStations.some((entry) => stationMatches(entry, station))) {
      return { ok: false as const, error: `${station.name} is already in this folder.` };
    }

    const optimisticId = `temp-station-${Date.now()}`;
    const optimisticEntry: SavedStation = {
      station: {
        id: optimisticId,
        name: station.name,
        streamUrl: station.streamUrl,
        country: station.country ?? null,
        favicon: station.favicon ?? null,
      },
    };

    setFolderStationsById((current) => ({
      ...current,
      [folderId]: [optimisticEntry, ...(current[folderId] ?? [])],
    }));
    setLoadedFolderIds((current) => ({ ...current, [folderId]: true }));
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, stationCount: folder.stationCount + 1 }
          : folder
      )
    );

    try {
      await apiFetch(`/folder-stations/${folderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(station),
      });

      await loadFolderStations(folderId, true);
      await loadFolders();

      return { ok: true as const };
    } catch (err: any) {
      setFolderStationsById((current) => ({
        ...current,
        [folderId]: (current[folderId] ?? []).filter(
          (entry) => entry.station?.id !== optimisticId
        ),
      }));
      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderId
            ? { ...folder, stationCount: Math.max(0, folder.stationCount - 1) }
            : folder
        )
      );

      return {
        ok: false as const,
        error: err.message || 'Failed to save station.',
      };
    }
  };

  const removeStationFromFolder = async (folderId: string, stationId: string) => {
    const previousStations = folderStationsById[folderId] ?? [];
    const nextStations = previousStations.filter(
      (entry) => entry.station?.id !== stationId
    );

    setFolderStationsById((current) => ({
      ...current,
      [folderId]: nextStations,
    }));
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, stationCount: Math.max(0, folder.stationCount - 1) }
          : folder
      )
    );

    try {
      await apiFetch(`/folder-stations/${folderId}/${stationId}`, {
        method: 'DELETE',
      });
      await loadFolders();

      return { ok: true as const };
    } catch (err: any) {
      setFolderStationsById((current) => ({
        ...current,
        [folderId]: previousStations,
      }));
      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderId
            ? { ...folder, stationCount: folder.stationCount + 1 }
            : folder
        )
      );

      return {
        ok: false as const,
        error: err.message || 'Could not remove this station right now.',
      };
    }
  };

  useEffect(() => {
    void loadFolders();
  }, [token]);

  return (
    <>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">Interactive world radio</p>
            <h1>Radio Sekai</h1>
          </div>

          <nav className="top-nav">
            <button
              className={page === 'radio' ? 'primary-button' : 'ghost-button'}
              onClick={() => setPage('radio')}
              type="button"
            >
              Radio map
            </button>

            <button
              className={page === 'folders' ? 'primary-button' : 'ghost-button'}
              onClick={() => {
                if (!token) {
                  openAuth('login');
                  return;
                }

                setPage('folders');
              }}
              type="button"
            >
              Folders
            </button>

            {token ? (
              <button
                className="ghost-button"
                onClick={() => void logout()}
                type="button"
              >
                Sign out
              </button>
            ) : (
              <button
                className="ghost-button"
                onClick={() => openAuth('login')}
                type="button"
              >
                Sign in
              </button>
            )}
          </nav>
        </header>

        <main className="page-shell">
          <div
            aria-hidden={page !== 'radio'}
            className={page === 'radio' ? 'page-panel' : 'page-panel page-panel-hidden'}
          >
            <Radio
              folders={folders}
              getSavedStations={(folderId) => folderStationsById[folderId] ?? []}
              loadingSavedFolderId={(folderId) => folderStationsLoading[folderId] ?? false}
              onEnsureSavedStations={loadFolderStations}
              onOpenFolders={() => setPage('folders')}
              onRequireAuth={openAuth}
              onSaveStation={saveStationToFolder}
              token={token}
            />
          </div>

          {page === 'folders' && token && (
            <Folders
              folders={folders}
              getSavedStations={(folderId) => folderStationsById[folderId] ?? []}
              loading={foldersLoading}
              loadingSavedFolderId={(folderId) => folderStationsLoading[folderId] ?? false}
              onAlert={showAlert}
              onCreateFolder={createFolder}
              onDeleteFolder={deleteFolder}
              onEnsureSavedStations={loadFolderStations}
              onRemoveStation={removeStationFromFolder}
            />
          )}

          {page === 'folders' && !token && (
            <section className="empty-state-card">
              <p className="eyebrow">Private library</p>
              <h2>Folders unlock after sign in</h2>
              <p>
                Create an account when you want to save favorite stations into
                your own folders.
              </p>
              <div className="inline-actions">
                <button
                  className="primary-button"
                  onClick={() => openAuth('signup')}
                  type="button"
                >
                  Create account
                </button>
                <button
                  className="ghost-button"
                  onClick={() => openAuth('login')}
                  type="button"
                >
                  Sign in
                </button>
              </div>
            </section>
          )}
        </main>
      </div>

      {alert && (
        <aside
          className={`app-alert app-alert-${alert.tone}`}
          role="status"
          aria-live="polite"
        >
          <p>{alert.message}</p>
          <button
            className="ghost-button app-alert-close"
            onClick={() => setAlert(null)}
            type="button"
          >
            Close
          </button>
        </aside>
      )}

      <AuthModal
        initialMode={authMode}
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAlert={showAlert}
        onSuccess={(nextToken) => {
          if (nextToken) {
            setToken(nextToken);
            showAlert('Signed in and ready to save stations.', 'success');
          }
          setAuthOpen(false);
        }}
      />
    </>
  );
}

export default App;

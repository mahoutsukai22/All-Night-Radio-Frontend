import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import type { FolderSummary, SavedStation } from '../App';

type FoldersProps = {
  folders: FolderSummary[];
  getSavedStations: (folderId: string) => SavedStation[];
  loading: boolean;
  loadingSavedFolderId: (folderId: string) => boolean;
  onAlert: (
    message: string,
    tone?: 'info' | 'success' | 'error'
  ) => void;
  onCreateFolder: (
    name: string
  ) => Promise<{ ok: boolean; error?: string; folder?: FolderSummary }>;
  onDeleteFolder: (
    folderId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onEnsureSavedStations: (folderId: string, force?: boolean) => Promise<unknown>;
  onRenameFolder: (
    folderId: string,
    name: string
  ) => Promise<{ ok: boolean; error?: string; folder?: FolderSummary }>;
  onRemoveStation: (
    folderId: string,
    stationId: string
  ) => Promise<{ ok: boolean; error?: string }>;
};

export default function Folders({
  folders,
  getSavedStations,
  loading,
  loadingSavedFolderId,
  onAlert,
  onCreateFolder,
  onDeleteFolder,
  onEnsureSavedStations,
  onRenameFolder,
  onRemoveStation,
}: FoldersProps) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [savedStationsError, setSavedStationsError] = useState('');
  const [removingStationId, setRemovingStationId] = useState<string | null>(null);
  const savedStations = selectedFolderId ? getSavedStations(selectedFolderId) : [];
  const loadingSavedStations = selectedFolderId
    ? loadingSavedFolderId(selectedFolderId)
    : false;
  const selectedFolder =
    folders.find((folder) => folder.id === selectedFolderId) ?? null;

  const createFolder = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setFieldError('Folder name is required.');
      return;
    }

    try {
      setFieldError('');
      const result = await onCreateFolder(trimmedName);

      if (!result.ok) {
        setFieldError(result.error || 'Could not create that folder right now.');
        return;
      }

      setName('');
      onAlert(`Folder "${trimmedName}" is ready for saved stations.`, 'success');
      setSelectedFolderId(result.folder?.id ?? '');
      setSavedStationsError('');
    } catch {
      setFieldError('Could not create that folder right now.');
    }
  };

  const deleteFolder = async (id: string) => {
    try {
      const result = await onDeleteFolder(id);

      if (!result.ok) {
        onAlert(result.error || 'Could not remove that folder right now.', 'error');
        return;
      }

      onAlert('Folder removed from your library.', 'info');
    } catch {
      onAlert('Could not remove that folder right now.', 'error');
    }
  };

  const renameFolder = async () => {
    const trimmedName = renameName.trim();

    if (!selectedFolderId) {
      setRenameError('Select a folder to rename.');
      return;
    }

    if (!trimmedName) {
      setRenameError('Folder name is required.');
      return;
    }

    if (selectedFolder?.name === trimmedName) {
      setRenameError('Choose a new folder name.');
      return;
    }

    try {
      setRenamingFolderId(selectedFolderId);
      setRenameError('');
      const result = await onRenameFolder(selectedFolderId, trimmedName);

      if (!result.ok) {
        setRenameError(result.error || 'Could not rename that folder right now.');
        return;
      }

      setRenameName(trimmedName);
      onAlert(`Folder renamed to "${trimmedName}".`, 'success');
    } catch {
      setRenameError('Could not rename that folder right now.');
    } finally {
      setRenamingFolderId(null);
    }
  };

  const removeSavedStation = async (stationId: string) => {
    if (!selectedFolderId || removingStationId === stationId) {
      return;
    }

    try {
      setRemovingStationId(stationId);
      setSavedStationsError('');
      const result = await onRemoveStation(selectedFolderId, stationId);

      if (!result.ok) {
        setSavedStationsError(result.error || 'Could not remove this station right now.');
        return;
      }

      onAlert('Station removed from this folder.', 'info');
    } catch {
      setSavedStationsError('Could not remove this station right now.');
    } finally {
      setRemovingStationId(null);
    }
  };

  useEffect(() => {
    setSelectedFolderId((current) => {
      if (current && folders.some((folder) => folder.id === current)) {
        return current;
      }

      return folders[0]?.id ?? '';
    });
  }, [folders]);

  useEffect(() => {
    setRenameName(selectedFolder?.name ?? '');
    setRenameError('');
  }, [selectedFolder?.id, selectedFolder?.name]);

  useEffect(() => {
    if (!selectedFolderId) {
      setSavedStationsError('');
      return;
    }

    void onEnsureSavedStations(selectedFolderId).catch(() => {
      setSavedStationsError('Could not load the saved stations for this folder.');
    });
  }, [selectedFolderId]);

  return (
    <section className="folders-page">
      <div className="panel-card folder-hero">
        <div>
          <p className="eyebrow">Your private library</p>
          <h2>Station folders</h2>
          <p>
            Build themed shelves for late-night jazz, local stations, road
            trips, or anything else you want to revisit quickly.
          </p>
        </div>

        <div className="folder-create">
          <TextField
            error={Boolean(fieldError)}
            helperText={fieldError || ' '}
            label="New folder"
            onChange={(event) => {
              setName(event.target.value);
              if (fieldError) {
                setFieldError('');
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void createFolder();
              }
            }}
            placeholder="Create a new folder"
            value={name}
          />
          <button
            className="primary-button"
            onClick={() => void createFolder()}
            type="button"
          >
            Add folder
          </button>
        </div>
      </div>

      {loading && <section className="panel-card">Loading folders...</section>}

      {!loading && folders.length === 0 && (
        <section className="empty-state-card">
          <p className="eyebrow">Nothing saved yet</p>
          <h2>Create your first folder</h2>
          <p>
            Your favorites will start appearing here as soon as you save
            stations from the radio map.
          </p>
        </section>
      )}

      {!loading && folders.length > 0 && (
        <div className="folder-library-layout">
          <div className="folder-grid-scroll">
            <div className="folder-grid">
              {folders.map((folder) => {
                const isSelected = folder.id === selectedFolderId;

                return (
                  <article
                    className={
                      isSelected
                        ? 'panel-card folder-card folder-card-selected'
                        : 'panel-card folder-card'
                    }
                    key={folder.id}
                  >
                    <button
                      className="folder-card-main"
                      onClick={() => setSelectedFolderId(folder.id)}
                      type="button"
                    >
                      <div>
                        <p className="eyebrow">Folder</p>
                        <h3>{folder.name}</h3>
                        <p>
                          {folder.stationCount === 1
                            ? '1 saved station'
                            : `${folder.stationCount} saved stations`}
                        </p>
                      </div>
                      <span className="modal-pill">
                        {isSelected ? 'Viewing' : 'View stations'}
                      </span>
                    </button>

                    <button
                      className="ghost-button danger-button"
                      onClick={() => void deleteFolder(folder.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          <section className="panel-card folder-stations-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Saved stations</p>
                <h2>
                  {selectedFolder?.name || 'Select a folder'}
                </h2>
              </div>
            </div>

            {selectedFolder && (
              <div className="folder-create">
                <TextField
                  error={Boolean(renameError)}
                  helperText={renameError || ' '}
                  label="Rename folder"
                  onChange={(event) => {
                    setRenameName(event.target.value);
                    if (renameError) {
                      setRenameError('');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void renameFolder();
                    }
                  }}
                  placeholder="Update this folder name"
                  value={renameName}
                />
                <button
                  className="ghost-button"
                  disabled={!selectedFolderId || renamingFolderId === selectedFolderId}
                  onClick={() => void renameFolder()}
                  type="button"
                >
                  {renamingFolderId === selectedFolderId ? 'Renaming...' : 'Rename'}
                </button>
              </div>
            )}

            {loadingSavedStations && (
              <p className="support-copy">Loading saved stations...</p>
            )}

            {!loadingSavedStations && savedStationsError && (
              <p className="form-error">{savedStationsError}</p>
            )}

            {!loadingSavedStations && !savedStationsError && savedStations.length === 0 && (
              <div className="empty-state-card folder-stations-empty">
                <p className="eyebrow">Ready for favorites</p>
                <h2>No saved stations in this folder yet</h2>
                <p>
                  Save stations from the radio map, then open this folder to
                  review them here.
                </p>
              </div>
            )}

            {!loadingSavedStations && savedStations.length > 0 && (
              <div className="saved-stations-list folder-stations-list">
                {savedStations.map((item) => (
                  <article className="saved-station-item" key={item.station?.id}>
                    <div>
                      <strong>{item.station?.name || 'Unknown station'}</strong>
                      <span>{item.station?.country || 'Unknown location'}</span>
                    </div>
                    {item.station?.id && (
                      <div className="saved-station-item-actions">
                        <button
                          className="ghost-button danger-button"
                          disabled={removingStationId === item.station.id}
                          onClick={() => void removeSavedStation(item.station!.id)}
                          type="button"
                        >
                          {removingStationId === item.station.id
                            ? 'Removing...'
                            : 'Remove'}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

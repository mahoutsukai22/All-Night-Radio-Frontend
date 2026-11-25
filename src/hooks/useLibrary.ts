import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { streamUrl, type RadioStation } from '../lib/radio';

export type Folder = { id: string; name: string; stationCount: number };

type SavedStation = {
  id: string;
  name: string;
  streamUrl: string;
  country?: string | null;
  favicon?: string | null;
};

const toStation = (s: SavedStation): RadioStation => ({
  stationuuid: s.id,
  name: s.name,
  url: s.streamUrl,
  country: s.country ?? undefined,
  favicon: s.favicon ?? undefined,
});

type LibraryState = { owner?: string; folders: Folder[] };

const NO_FOLDERS: Folder[] = [];

const mapFolders = (update: (list: Folder[]) => Folder[]) => (s: LibraryState) => ({
  ...s,
  folders: update(s.folders),
});

const bump = (folderId: string, delta: number) =>
  mapFolders((list) =>
    list.map((f) => (f.id === folderId ? { ...f, stationCount: Math.max(0, f.stationCount + delta) } : f)),
  );

/** The signed-in user's folders and the stations saved in them. */
export function useLibrary(userId: string | undefined) {
  // Folders are tagged with the user they were loaded for, so switching accounts never shows stale data.
  const [state, setState] = useState<LibraryState>({ folders: [] });
  const [saved, setSaved] = useState<Record<string, RadioStation[]>>({});
  const folders = userId && state.owner === userId ? state.folders : NO_FOLDERS;
  const loading = !!userId && state.owner !== userId;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    api<Folder[]>('/folders')
      .catch((err) => {
        console.error('Failed to load folders', err);
        return [];
      })
      .then((list) => live && setState({ owner: userId, folders: list }));
    return () => {
      live = false;
    };
  }, [userId]);

  const loadStations = useCallback(async (folderId: string) => {
    const list = await api<SavedStation[]>(`/folder-stations/${folderId}`);
    setSaved((map) => ({ ...map, [folderId]: list.map(toStation) }));
  }, []);

  const createFolder = useCallback(async (name: string) => {
    const folder = await api<Folder>('/folders', { method: 'POST', body: { name } });
    setState(mapFolders((list) => [...list, folder]));
    return folder;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const folder = await api<Folder>(`/folders/${id}`, { method: 'PATCH', body: { name } });
    setState(mapFolders((list) => list.map((f) => (f.id === id ? folder : f))));
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await api(`/folders/${id}`, { method: 'DELETE' });
    setState(mapFolders((list) => list.filter((f) => f.id !== id)));
  }, []);

  const addStation = useCallback(async (folderId: string, s: RadioStation) => {
    const created = await api<SavedStation>(`/folder-stations/${folderId}`, {
      method: 'POST',
      body: {
        name: s.name.slice(0, 200),
        streamUrl: streamUrl(s),
        country: s.country || null,
        favicon: s.favicon || null,
      },
    });
    setSaved((map) => (map[folderId] ? { ...map, [folderId]: [toStation(created), ...map[folderId]] } : map));
    setState(bump(folderId, 1));
  }, []);

  const removeStation = useCallback(async (folderId: string, stationId: string) => {
    await api(`/folder-stations/${folderId}/${stationId}`, { method: 'DELETE' });
    setSaved((map) => ({ ...map, [folderId]: (map[folderId] ?? []).filter((s) => s.stationuuid !== stationId) }));
    setState(bump(folderId, -1));
  }, []);

  return useMemo(
    () => ({
      folders,
      saved,
      loading,
      loadStations,
      createFolder,
      renameFolder,
      deleteFolder,
      addStation,
      removeStation,
    }),
    [folders, saved, loading, loadStations, createFolder, renameFolder, deleteFolder, addStation, removeStation],
  );
}

export type Library = ReturnType<typeof useLibrary>;

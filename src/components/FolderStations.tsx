import { useEffect } from 'react';
import { useApp } from '../context';
import type { RadioStation } from '../lib/radio';
import StationList from './StationList';

/** Stations saved in one folder, fetched on first view and cached in the library. */
export default function FolderStations({ folderId, removable }: { folderId: string; removable?: boolean }) {
  const { library, notify } = useApp();
  const { loadStations, removeStation } = library;
  const stations = library.saved[folderId];

  useEffect(() => {
    if (!stations) loadStations(folderId).catch(() => notify('Could not open this folder.', 'error'));
  }, [folderId, stations, loadStations, notify]);

  const remove = (s: RadioStation) =>
    removeStation(folderId, s.stationuuid)
      .then(() => notify(`Removed ${s.name}.`))
      .catch((err: Error) => notify(err.message, 'error'));

  return (
    <StationList
      empty="This folder is waiting for its first signal. Press the bookmark on any station."
      key={folderId}
      loading={!stations}
      onRemove={removable ? remove : undefined}
      stations={stations ?? []}
    />
  );
}

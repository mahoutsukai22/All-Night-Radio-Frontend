import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import type { RadioStation } from '../lib/radio';
import Icon from './Icon';
import Modal from './Modal';

export default function SaveDialog({ station, onClose }: { station: RadioStation | null; onClose: () => void }) {
  const { library, notify } = useApp();
  const [busy, setBusy] = useState(false);

  const save = async (folder: { id: string; name: string } | Promise<{ id: string; name: string }>) => {
    if (!station) return;
    setBusy(true);
    try {
      const target = await folder;
      await library.addStation(target.id, station);
      notify(`Saved ${station.name} to ${target.name}.`, 'success');
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save that station.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name')).trim();
    if (name) void save(library.createFolder(name));
  };

  return (
    <Modal eyebrow="Save to library" onClose={onClose} open={!!station} title={station?.name ?? ''}>
      {library.folders.length > 0 && (
        <ul className="folder-picker">
          {library.folders.map((f) => (
            <li key={f.id}>
              <button className="folder-row" disabled={busy} onClick={() => void save(f)} type="button">
                <Icon name="folder" />
                <span>{f.name}</span>
                <small>{f.stationCount}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={create}>
        <input aria-label="New folder name" maxLength={60} name="name" placeholder="New folder, e.g. Late-night jazz" required />
        <button className="btn" disabled={busy} type="submit">
          <Icon name="plus" /> Create & save
        </button>
      </form>
    </Modal>
  );
}

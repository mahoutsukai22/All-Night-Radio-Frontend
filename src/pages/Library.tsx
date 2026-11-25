import { useState, type FormEvent } from 'react';
import FolderStations from '../components/FolderStations';
import Icon from '../components/Icon';
import { useApp } from '../context';

const nameFrom = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return String(new FormData(e.currentTarget).get('name')).trim();
};

export default function Library() {
  const { library, notify } = useApp();
  const [picked, setPicked] = useState<string>();
  const [editing, setEditing] = useState(false);
  const folder = library.folders.find((f) => f.id === picked) ?? library.folders[0];
  const fail = (err: unknown) => notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');

  const create = (e: FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const name = nameFrom(e);
    if (!name) return;
    library
      .createFolder(name)
      .then((f) => {
        form.reset();
        setPicked(f.id);
        notify(`Folder “${name}” is ready.`, 'success');
      })
      .catch(fail);
  };

  const rename = (e: FormEvent<HTMLFormElement>) => {
    const name = nameFrom(e);
    if (!folder || !name) return;
    library
      .renameFolder(folder.id, name)
      .then(() => {
        setEditing(false);
        notify(`Renamed to “${name}”.`, 'success');
      })
      .catch(fail);
  };

  const remove = () => {
    if (!folder || !confirm(`Delete “${folder.name}” and its ${folder.stationCount} saved stations?`)) return;
    library
      .deleteFolder(folder.id)
      .then(() => notify('Folder deleted.'))
      .catch(fail);
  };

  return (
    <section className="panel library">
      <header className="library-head">
        <div>
          <p className="eyebrow">Your private library</p>
          <h1>Station folders</h1>
        </div>
        <form className="inline-form" onSubmit={create}>
          <input aria-label="New folder name" maxLength={60} name="name" placeholder="New folder name" required />
          <button className="btn" type="submit">
            <Icon name="plus" /> Add
          </button>
        </form>
      </header>

      {library.loading ? (
        <p className="list-note">Opening your library…</p>
      ) : !folder ? (
        <div className="cta">
          <h2>Start your first folder</h2>
          <p className="muted">Shelves for late-night jazz, road trips, home towns — anything you want to find again.</p>
        </div>
      ) : (
        <div className="library-grid">
          <ul className="folder-picker">
            {library.folders.map((f) => (
              <li key={f.id}>
                <button
                  aria-current={f.id === folder.id}
                  className="folder-row"
                  onClick={() => {
                    setPicked(f.id);
                    setEditing(false);
                  }}
                  type="button"
                >
                  <Icon name="folder" />
                  <span>{f.name}</span>
                  <small>{f.stationCount}</small>
                </button>
              </li>
            ))}
          </ul>

          <div className="library-detail">
            <header className="detail-head">
              {editing ? (
                <form className="inline-form" onSubmit={rename}>
                  <input aria-label="Folder name" autoFocus defaultValue={folder.name} maxLength={60} name="name" required />
                  <button className="btn" type="submit">
                    Save
                  </button>
                  <button className="btn ghost" onClick={() => setEditing(false)} type="button">
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h2>{folder.name}</h2>
                  <button aria-label="Rename folder" className="icon-btn" onClick={() => setEditing(true)} type="button">
                    <Icon name="edit" />
                  </button>
                  <button aria-label="Delete folder" className="icon-btn danger" onClick={remove} type="button">
                    <Icon name="trash" />
                  </button>
                </>
              )}
            </header>
            <div className="panel-scroll">
              <FolderStations folderId={folder.id} removable />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

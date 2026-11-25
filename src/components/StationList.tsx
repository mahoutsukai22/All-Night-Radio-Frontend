import { useState } from 'react';
import { useApp } from '../context';
import { placeOf, type RadioStation } from '../lib/radio';
import Icon from './Icon';

const PAGE = 40;

type Props = {
  stations: RadioStation[];
  empty: string;
  loading?: boolean;
  onRemove?: (station: RadioStation) => void;
};

/**
 * Renders stations in pages of 40 so long lists never flood the DOM.
 * Give it a `key` that changes with the data source to reset paging.
 */
export default function StationList({ stations, empty, loading, onRemove }: Props) {
  const { player, requestSave } = useApp();
  const [limit, setLimit] = useState(PAGE);

  if (!stations.length) {
    return <p className="list-note">{loading ? 'Tuning in…' : empty}</p>;
  }

  return (
    <>
      <ul className="station-list">
        {stations.slice(0, limit).map((s) => {
          const active = player.station?.stationuuid === s.stationuuid;
          return (
            <li className={active ? 'station is-active' : 'station'} key={s.stationuuid}>
              <button className="station-main" onClick={() => player.play(s)} type="button">
                <span className="art" data-initial={s.name.trim()[0]?.toUpperCase()}>
                  {s.favicon && (
                    <img
                      alt=""
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      src={s.favicon}
                    />
                  )}
                </span>
                <span className="station-text">
                  <strong>{s.name}</strong>
                  <small>{placeOf(s) || s.tags?.split(',')[0] || 'Unknown location'}</small>
                </span>
                {active && player.status === 'playing' && (
                  <span aria-label="Playing" className="eq">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
              {onRemove ? (
                <button aria-label={`Remove ${s.name}`} className="icon-btn danger" onClick={() => onRemove(s)} type="button">
                  <Icon name="trash" />
                </button>
              ) : (
                <button aria-label={`Save ${s.name}`} className="icon-btn" onClick={() => requestSave(s)} type="button">
                  <Icon name="bookmark" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {stations.length > limit && (
        <button className="btn ghost more" onClick={() => setLimit((n) => n + PAGE)} type="button">
          Show more · {stations.length - limit} left
        </button>
      )}
    </>
  );
}

import { useState } from 'react';
import { useApp } from '../context';
import { placeOf } from '../lib/radio';
import Icon from './Icon';

const STATUS = {
  idle: 'Pick a dot on the globe',
  loading: 'Tuning in…',
  playing: 'On air',
  paused: 'Paused',
  error: 'Stream unavailable — try another station',
};

export default function PlayerBar() {
  const { player, requestSave } = useApp();
  const { station, status } = player;
  const [volume, setVolume] = useState(1);

  const changeVolume = (value: number) => {
    player.setVolume(value);
    setVolume(value);
  };

  return (
    <footer className={`player is-${status}`}>
      <span className="art" data-initial={station?.name.trim()[0]?.toUpperCase() ?? '♪'}>
        {station?.favicon && (
          <img alt="" key={station.favicon} onError={(e) => (e.currentTarget.style.display = 'none')} src={station.favicon} />
        )}
      </span>
      <div className="player-text">
        <small className="eyebrow">{STATUS[status]}</small>
        <strong>{station?.name ?? 'Radio Sekai'}</strong>
        <span>{station ? placeOf(station) || 'Somewhere on Earth' : 'Live radio from every corner of the world'}</span>
      </div>
      <button
        aria-label={status === 'playing' || status === 'loading' ? 'Pause' : 'Play'}
        className="play-btn"
        disabled={!station}
        onClick={player.toggle}
        type="button"
      >
        <Icon name={status === 'playing' || status === 'loading' ? 'pause' : 'play'} size={22} />
      </button>
      <label className="volume">
        <button aria-label="Mute" className="icon-btn" onClick={() => changeVolume(volume ? 0 : 0.8)} type="button">
          <Icon name={volume ? 'volume' : 'mute'} />
        </button>
        <input
          aria-label="Volume"
          max={1}
          min={0}
          onChange={(e) => changeVolume(Number(e.target.value))}
          step={0.05}
          type="range"
          value={volume}
        />
      </label>
      <button
        aria-label="Save station"
        className="icon-btn"
        disabled={!station}
        onClick={() => station && requestSave(station)}
        title="Save to a folder"
        type="button"
      >
        <Icon name="bookmark" />
      </button>
    </footer>
  );
}

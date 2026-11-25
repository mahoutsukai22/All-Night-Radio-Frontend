import { useCallback, useEffect, useMemo, useState } from 'react';
import { placeOf, streamUrl, type RadioStation } from '../lib/radio';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

const EVENTS: Record<string, PlayerStatus> = {
  playing: 'playing',
  pause: 'paused',
  waiting: 'loading',
  error: 'error',
};

// One <audio> element for the whole app, created on first use.
let element: HTMLAudioElement | undefined;
const audio = () => (element ??= Object.assign(new Audio(), { preload: 'none' }));

export function usePlayer() {
  const [station, setStation] = useState<RadioStation | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('idle');

  useEffect(() => {
    const offs = Object.entries(EVENTS).map(([event, next]) => {
      const handler = () => setStatus(next);
      audio().addEventListener(event, handler);
      return () => audio().removeEventListener(event, handler);
    });
    return () => offs.forEach((off) => off());
  }, []);

  const play = useCallback(
    (next: RadioStation) => {
      setStation(next);
      setStatus('loading');
      // Re-setting src reconnects to the live edge instead of replaying a stale buffer.
      audio().src = streamUrl(next);
      audio()
        .play()
        .catch((err: Error) => err.name !== 'AbortError' && setStatus('error'));

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: next.name,
          artist: placeOf(next) || 'Radio Sekai',
          artwork: next.favicon ? [{ src: next.favicon }] : [],
        });
      }
    },
    [],
  );

  const toggle = useCallback(() => {
    if (!station) return;
    if (audio().paused) play(station);
    else audio().pause();
  }, [play, station]);

  const setVolume = useCallback((volume: number) => {
    Object.assign(audio(), { volume, muted: false });
  }, []);

  return useMemo(() => ({ station, status, play, toggle, setVolume }), [station, status, play, toggle, setVolume]);
}

import { useEffect, useLayoutEffect, useState } from 'react';

export const SEASONS = [
  { id: 'spring', kanji: '春', label: 'Spring', mood: 'Sakura nights' },
  { id: 'summer', kanji: '夏', label: 'Summer', mood: 'Firefly coast' },
  { id: 'autumn', kanji: '秋', label: 'Autumn', mood: 'Maple static' },
  { id: 'winter', kanji: '冬', label: 'Winter', mood: 'Snowfall signal' },
] as const;

export type Season = (typeof SEASONS)[number]['id'];
export type ThemeChoice = Season | 'auto';

export const seasonFor = (date = new Date()): Season => {
  const m = date.getMonth();
  return m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) */
  }
};

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(
    () => (read('sekai.theme') as ThemeChoice | null) ?? 'auto',
  );
  const [fx, setFx] = useState(() => read('sekai.fx') !== 'off');
  const season = choice === 'auto' ? seasonFor() : choice;

  // Layout effect: the theme must be applied before the globe (a child) reads its colours.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = season;
    write('sekai.theme', choice);
  }, [choice, season]);

  useEffect(() => write('sekai.fx', fx ? 'on' : 'off'), [fx]);

  return { choice, season, setChoice, fx, setFx };
}

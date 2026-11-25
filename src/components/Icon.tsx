const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  bookmark: 'M6.5 4h11v16.5L12 16.8l-5.5 3.7z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z',
  folder: 'M3.5 7.5A2 2 0 0 1 5.5 5.5h3.7l2 2h7.3a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  close: 'M6 6l12 12M18 6L6 18',
  volume: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7',
  edit: 'M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4',
  sparkle: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  chevron: 'M6 15l6-6 6 6',
  logout: 'M14.5 4.5h4v15h-4M10 8l-4 4 4 4M6 12h10',
} as const;

const FILLED = new Set(['play', 'pause']);

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name);
  return (
    <svg
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      height={size}
      stroke={filled ? 'none' : 'currentColor'}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

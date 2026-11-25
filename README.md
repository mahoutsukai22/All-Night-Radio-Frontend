# Radio Sekai — frontend

Spin a globe and tune into live radio worldwide. React 18 + Vite, stations from
[radio-browser.info](https://www.radio-browser.info), accounts via Supabase.

```bash
cp .env.example .env   # fill in API + Supabase values
npm install
npm run dev
```

## Layout

```
src/
  App.tsx              shell: top bar, pages, toasts, dialogs, app context
  context.ts           AppContext + useApp()
  styles.css           season theme tokens + all styles
  lib/                 radio-browser client, backend api(), lazy Supabase, themes
  hooks/               usePlayer, useSession, useLibrary
  components/          Globe (canvas), Ambience (seasonal particles), PlayerBar,
                       StationList, dialogs, ThemePicker, Icon
  pages/               Explore (globe + side panel), Library (folders, lazy-loaded)
```

## Performance notes

- The globe is drawn on one `<canvas>` with d3-geo. Dragging, zooming and inertia
  update a ref and redraw in `requestAnimationFrame`; React never re-renders per frame.
- Country shapes, topojson and Supabase are separate chunks loaded after first paint.
- Stations load in two pages (250 fast, then 750) because the directory API doesn't gzip.
- No `backdrop-filter`/CSS `filter` on surfaces over the animated globe; lists render in pages of 40.
- Seasonal particles are pre-rendered sprites on one canvas and respect `prefers-reduced-motion`
  (and the ✨ toggle).

## Themes

春 Spring · 夏 Summer · 秋 Autumn · 冬 Winter, or **Auto** (follows the calendar).
Each theme is a block of CSS custom properties in `styles.css`; the globe reads the same tokens.

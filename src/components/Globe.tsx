import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import {
  geoBounds,
  geoCentroid,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { hasGeo, placeOf, type RadioStation } from '../lib/radio';

type Props = {
  stations: RadioStation[];
  active?: RadioStation | null;
  country?: string;
  theme: string;
  onCountry: (name: string | null) => void;
  onStation: (station: RadioStation) => void;
};

type LonLat = [number, number];
type Country = { feature: Feature<Geometry, { name: string }>; bounds: [LonLat, LonLat] };
type World = { land: FeatureCollection; countries: Country[] };
type Controls = { redraw: () => void; readColors: () => void; flyTo: (to: LonLat) => void; flyToCountry: (name: string) => void };

const MIN_ZOOM = 0.9;
const MAX_ZOOM = 14;
const SPHERE = { type: 'Sphere' } as const;
const GRATICULE = geoGraticule10();
const COLOR_VARS = ['ocean', 'ocean-2', 'land', 'land-line', 'land-hi', 'dot', 'accent', 'glow'] as const;

let worldRequest: Promise<World> | undefined;
// Country shapes live in their own chunk and are fetched once, after first paint.
const loadWorld = () =>
  (worldRequest ??= Promise.all([import('world-atlas/countries-110m.json'), import('topojson-client')]).then(
    ([{ default: topology }, { feature }]) => {
      const topo = topology as unknown as Parameters<typeof feature>[0];
      const land = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
      return { land, countries: land.features.map((f) => ({ feature: f, bounds: geoBounds(f) as [LonLat, LonLat] })) };
    },
  ));

const inBounds = ([[w, s], [e, n]]: [LonLat, LonLat], [lon, lat]: LonLat) =>
  lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function Globe({ stations, active, country, theme, onCountry, onStation }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  // Latest props for the imperative layer; read inside event handlers and draw().
  const latest = useRef({ stations, active, country, onCountry, onStation });

  useLayoutEffect(() => {
    latest.current = { stations, active, country, onCountry, onStation };
  });

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const tip = tipRef.current!;
    const pulse = pulseRef.current!;
    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);

    const view = { w: 0, h: 0, dpr: 1, rotate: [-10, -22] as LonLat, zoom: 1 };
    const colors: Record<string, string> = {};
    let world: World | null = null;
    let hovered: Country | null = null;
    let hits: number[] = []; // flat [x, y, stationIndex, ...] of visible dots from the last frame
    let frame = 0;
    let motion = 0;

    const radius = () => Math.min(view.w, view.h) * 0.42 * view.zoom;
    const findCountry = (name?: string) => world?.countries.find((c) => c.feature.properties.name === name);

    const draw = () => {
      const { w, h, dpr } = view;
      const r = radius();
      const [cx, cy] = [w / 2, h / 2];
      projection.scale(r).translate([cx, cy]).rotate(view.rotate);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const halo = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.22);
      halo.addColorStop(0, colors.glow);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      const sea = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r);
      sea.addColorStop(0, colors['ocean-2']);
      sea.addColorStop(1, colors.ocean);
      ctx.beginPath();
      path(SPHERE);
      ctx.fillStyle = sea;
      ctx.fill();

      ctx.beginPath();
      path(GRATICULE);
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = colors['land-line'];
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (world) {
        ctx.beginPath();
        path(world.land);
        ctx.fillStyle = colors.land;
        ctx.fill();
        ctx.lineWidth = 0.6;
        ctx.stroke();

        const selected = findCountry(latest.current.country);
        for (const c of new Set([hovered, selected])) {
          if (!c) continue;
          ctx.beginPath();
          path(c.feature);
          ctx.fillStyle = colors['land-hi'];
          ctx.fill();
          if (c === selected) {
            ctx.lineWidth = 1.3;
            ctx.strokeStyle = colors.accent;
            ctx.stroke();
          }
        }
      }

      // Station dots: one batched path for the halo and one for the core.
      const center: LonLat = [-view.rotate[0], -view.rotate[1]];
      const list = latest.current.stations;
      const dot = Math.min(4, 1.5 + view.zoom * 0.22);
      hits = [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const p: LonLat = [s.geo_long!, s.geo_lat!];
        if (geoDistance(p, center) > 1.55) continue;
        const [x, y] = projection(p)!;
        hits.push(x, y, i);
      }
      ctx.fillStyle = colors.dot;
      for (const [alpha, size] of [[0.22, dot * 2.6], [1, dot]]) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let i = 0; i < hits.length; i += 3) {
          ctx.moveTo(hits[i] + size, hits[i + 1]);
          ctx.arc(hits[i], hits[i + 1], size, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const { active } = latest.current;
      const spot: LonLat | null = active && hasGeo(active) ? [active.geo_long!, active.geo_lat!] : null;
      pulse.hidden = !spot || geoDistance(spot, center) > 1.55;
      if (!pulse.hidden) {
        const [x, y] = projection(spot!)!;
        pulse.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    };

    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), draw()));
    };

    const readColors = () => {
      const style = getComputedStyle(wrap);
      for (const name of COLOR_VARS) colors[name] = style.getPropertyValue(`--${name}`).trim();
      redraw();
    };

    const setRotate = (lon: number, lat: number) => {
      view.rotate = [((lon + 540) % 360) - 180, Math.max(-80, Math.min(80, lat))];
      redraw();
    };
    const setZoom = (zoom: number) => {
      view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
      redraw();
    };
    const stop = () => cancelAnimationFrame(motion);

    const animate = (step: (t: number) => boolean) => {
      stop();
      const loop = (t: number) => {
        if (step(t)) motion = requestAnimationFrame(loop);
      };
      motion = requestAnimationFrame(loop);
    };

    const flyTo = (to: LonLat) => {
      const from: LonLat = [-view.rotate[0], -view.rotate[1]];
      const path = geoInterpolate(from, to);
      const duration = 500 + geoDistance(from, to) * 350;
      let start = 0;
      animate((t) => {
        start ||= t;
        const k = Math.min(1, (t - start) / duration);
        const [lon, lat] = path(ease(k));
        setRotate(-lon, -lat);
        return k < 1;
      });
    };

    const flyToCountry = (name: string) => {
      const c = findCountry(name);
      if (c) flyTo(geoCentroid(c.feature) as LonLat);
    };

    const stationAt = (x: number, y: number, slop: number) => {
      let best = -1;
      let bestD = slop * slop;
      for (let i = 0; i < hits.length; i += 3) {
        const d = (hits[i] - x) ** 2 + (hits[i + 1] - y) ** 2;
        if (d < bestD) [best, bestD] = [hits[i + 2], d];
      }
      return best < 0 ? null : latest.current.stations[best];
    };

    const countryAt = (x: number, y: number) => {
      const p = projection.invert?.([x, y]);
      if (!p || !world || geoDistance(p, [-view.rotate[0], -view.rotate[1]]) > Math.PI / 2) return null;
      return world.countries.find((c) => inBounds(c.bounds, p as LonLat) && geoContains(c.feature, p)) ?? null;
    };

    // --- Pointer interaction: drag to spin, pinch/wheel to zoom, tap to select ---
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let pinch: { dist: number; zoom: number } | null = null;
    let velocity: LonLat = [0, 0];
    let lastMove = 0;
    let hoverFrame = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const showTip = (s: RadioStation | null, x = 0, y = 0) => {
      tip.hidden = !s;
      if (!s) return;
      tip.textContent = [s.name, placeOf(s)].filter(Boolean).join(' · ');
      tip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const hover = (x: number, y: number) => {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        const s = stationAt(x, y, 9);
        const c = s ? null : countryAt(x, y);
        showTip(s, x, y);
        canvas.style.cursor = s || c ? 'pointer' : 'grab';
        if (c !== hovered) {
          hovered = c;
          redraw();
        }
      });
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      stop();
      showTip(null);
      if (pointers.size === 2) {
        pinch = { dist: spread(), zoom: view.zoom };
        if (drag) drag.moved = true;
      } else {
        drag = { ...local(e), moved: false };
        velocity = [0, 0];
        canvas.style.cursor = 'grabbing';
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') hover(p.x, p.y);
        return;
      }
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        setZoom((pinch.zoom * spread()) / pinch.dist);
        return;
      }
      if (!drag) return;
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 5) drag.moved = true;
      const k = 180 / Math.PI / radius();
      const step: LonLat = [(p.x - prev.x) * k, -(p.y - prev.y) * k];
      setRotate(view.rotate[0] + step[0], view.rotate[1] + step[1]);
      const dt = Math.max(8, e.timeStamp - lastMove);
      velocity = [(step[0] * 16) / dt, (step[1] * 16) / dt];
      lastMove = e.timeStamp;
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size) return;
      pinch = null;
      canvas.style.cursor = 'grab';
      if (drag && !drag.moved) {
        const { x, y } = local(e);
        const s = stationAt(x, y, e.pointerType === 'touch' ? 18 : 10);
        if (s) latest.current.onStation(s);
        else latest.current.onCountry(countryAt(x, y)?.feature.properties.name ?? null);
      } else if (drag && e.timeStamp - lastMove < 60) {
        // Inertia: keep spinning and ease out.
        animate(() => {
          velocity = [velocity[0] * 0.94, velocity[1] * 0.94];
          setRotate(view.rotate[0] + velocity[0], view.rotate[1] + velocity[1]);
          return Math.abs(velocity[0]) + Math.abs(velocity[1]) > 0.02;
        });
      }
      drag = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stop();
      setZoom(view.zoom * Math.exp(-e.deltaY * 0.0015));
    };

    const onLeave = () => {
      cancelAnimationFrame(hoverFrame);
      showTip(null);
      if (hovered) {
        hovered = null;
        redraw();
      }
    };

    const resize = new ResizeObserver(() => {
      view.w = wrap.clientWidth;
      view.h = wrap.clientHeight;
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(view.w * view.dpr);
      canvas.height = Math.round(view.h * view.dpr);
      draw();
    });

    resize.observe(wrap);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let live = true;
    loadWorld().then((w) => {
      if (!live) return;
      world = w;
      redraw();
    });

    controls.current = { redraw, readColors, flyTo, flyToCountry };
    readColors();

    return () => {
      live = false;
      controls.current = null;
      stop();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      resize.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  useEffect(() => controls.current?.readColors(), [theme]);
  useEffect(() => controls.current?.redraw(), [stations]);

  useEffect(() => {
    if (country) controls.current?.flyToCountry(country);
    else controls.current?.redraw();
  }, [country]);

  useEffect(() => {
    if (active && hasGeo(active)) controls.current?.flyTo([active.geo_long!, active.geo_lat!]);
    else controls.current?.redraw();
  }, [active]);

  return (
    <div className="globe" ref={wrapRef}>
      <canvas aria-label="Interactive globe of radio stations" ref={canvasRef} />
      <div className="globe-pulse" hidden ref={pulseRef}>
        <span />
      </div>
      <div className="globe-tip" hidden ref={tipRef} />
    </div>
  );
}

export default memo(Globe);

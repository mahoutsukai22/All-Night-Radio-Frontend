import { useEffect, useRef } from 'react';
import type { Season } from '../lib/themes';

type Particle = { x: number; y: number; vx: number; vy: number; size: number; angle: number; spin: number; phase: number; sprite: HTMLCanvasElement };

const sprite = (size: number, paint: (g: CanvasRenderingContext2D, s: number) => void) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  return c;
};

const glow = (inner: string, outer: string) =>
  sprite(32, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.3, outer);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

const petal = (color: string) =>
  sprite(24, (g, s) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(s / 2, s / 2, s * 0.42, s * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(s * 0.93, s / 2, s * 0.12, 0, Math.PI * 2);
    g.fill();
  });

const leaf = (color: string) =>
  sprite(28, (g, s) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(s / 2, s * 0.06);
    g.quadraticCurveTo(s * 0.98, s * 0.42, s / 2, s * 0.94);
    g.quadraticCurveTo(s * 0.02, s * 0.42, s / 2, s * 0.06);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(s / 2, s * 0.14);
    g.lineTo(s / 2, s * 0.9);
    g.stroke();
  });

/** Per-season look and motion. `float` particles wander; the rest fall and sway. */
const SEASONS: Record<Season, { count: number; size: [number, number]; fall: [number, number]; sway: number; spin: number; float?: boolean; sprites: () => HTMLCanvasElement[] }> = {
  spring: { count: 26, size: [10, 18], fall: [0.35, 0.8], sway: 0.9, spin: 0.02, sprites: () => ['#ffc4dc', '#ffdbe9', '#f7a8c8'].map(petal) },
  summer: { count: 22, size: [14, 26], fall: [0, 0], sway: 0.4, spin: 0, float: true, sprites: () => [glow('rgba(255,252,200,1)', 'rgba(255,226,122,0.55)')] },
  autumn: { count: 18, size: [14, 24], fall: [0.6, 1.1], sway: 1.4, spin: 0.03, sprites: () => ['#ff8a3d', '#e8553a', '#ffb84d', '#c9452b'].map(leaf) },
  winter: { count: 60, size: [4, 11], fall: [0.4, 1.1], sway: 0.5, spin: 0, sprites: () => [glow('rgba(255,255,255,1)', 'rgba(235,245,255,0.6)')] },
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function Ambience({ season, enabled }: { season: Season; enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const config = SEASONS[season];
    const sprites = config.sprites();
    let particles: Particle[] = [];
    let raf = 0;

    const spawn = (anywhere: boolean): Particle => ({
      x: rand(0, canvas.width),
      y: anywhere || config.float ? rand(0, canvas.height) : rand(-40, -10),
      vx: config.float ? rand(-0.3, 0.3) : rand(0.1, 0.5),
      vy: config.float ? rand(-0.25, 0.25) : rand(...config.fall),
      size: rand(...config.size),
      angle: rand(0, Math.PI * 2),
      spin: rand(-config.spin, config.spin),
      phase: rand(0, Math.PI * 2),
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
    });

    const resize = () => {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      const density = Math.min(1.2, Math.max(0.4, (innerWidth * innerHeight) / (1440 * 900)));
      particles = Array.from({ length: Math.round(config.count * density) }, () => spawn(true));
    };

    const tick = (t: number) => {
      const { width: w, height: h } = canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.phase += 0.015;
        p.angle += p.spin;
        p.x += p.vx + Math.sin(p.phase) * config.sway * 0.4;
        p.y += p.vy;
        if (config.float) {
          p.x = (p.x + w) % w;
          p.y = (p.y + h) % h;
          ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + p.phase * 3));
        } else {
          if (p.y > h + 30 || p.x > w + 30) Object.assign(p, spawn(false));
          ctx.globalAlpha = 0.85;
        }
        ctx.setTransform(1, 0, 0, 1, p.x, p.y);
        ctx.rotate(p.angle);
        ctx.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [season, enabled]);

  return <canvas aria-hidden="true" className="ambience" ref={ref} />;
}

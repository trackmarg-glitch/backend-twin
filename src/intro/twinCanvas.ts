/**
 * The intro's centrepiece, drawn on a 2D canvas.
 *
 * The metaphor is literal: the part exists twice. The left half is drawn as
 * a green wireframe (the digital model) and the right half as a shaded solid
 * (the physical part). They assemble from scattered points, drift apart, and
 * then snap into one object - which is what a digital twin is.
 *
 * Canvas 2D rather than Three.js on purpose: the whole thing is one
 * requestAnimationFrame loop with no scene graph, no lighting and no asset
 * load, so the intro cannot be the reason first paint is slow.
 */

export const GREEN = '#86fe4c';
export const GREEN_HI = '#9aff61';

/** Seconds, matching CUE in audio.ts. */
const T = { form: 0.3, formEnd: 5.2, scan: 3.4, snap: 5.6, hold: 8.8 };
/** How long the scanline takes to cross, and how long the snap flash lasts. */
const SCAN_DUR = 1.7;
const SNAP_DUR = 0.9;

interface Pt {
  tx: number; ty: number;   // target, in unit space (-1..1)
  sx: number; sy: number;   // scattered origin
  delay: number;            // 0..1, staggers the assembly
  side: -1 | 1;             // -1 digital (left), 1 physical (right)
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Sample the wheel outline: rim, inner rim, hub, five Y-spokes, bolt circle. */
function buildPoints(): Pt[] {
  const pts: Pt[] = [];
  const push = (x: number, y: number) => {
    const side: -1 | 1 = x < 0 ? -1 : 1;
    const a = Math.random() * Math.PI * 2;
    const r = 1.6 + Math.random() * 1.4;
    pts.push({ tx: x, ty: y, sx: Math.cos(a) * r, sy: Math.sin(a) * r, delay: Math.random() * 0.55, side });
  };

  const ring = (radius: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      push(Math.cos(a) * radius, Math.sin(a) * radius);
    }
  };

  ring(1.0, 170);   // outer rim
  ring(0.86, 120);  // inner rim
  ring(0.2, 40);    // hub

  // Five spokes, hub out to inner rim.
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 - Math.PI / 2;
    for (let i = 0; i <= 22; i++) {
      const r = 0.2 + (i / 22) * 0.66;
      const spread = 0.055 * (1 - i / 22) + 0.02;
      push(Math.cos(a) * r - Math.sin(a) * spread, Math.sin(a) * r + Math.cos(a) * spread);
      push(Math.cos(a) * r + Math.sin(a) * spread, Math.sin(a) * r - Math.cos(a) * spread);
    }
  }

  // Bolt circle.
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
    const cx = Math.cos(a) * 0.36;
    const cy = Math.sin(a) * 0.36;
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      push(cx + Math.cos(t) * 0.05, cy + Math.sin(t) * 0.05);
    }
  }

  return pts;
}

export interface TwinScene {
  /** @param t seconds since the sequence began */
  draw(t: number): void;
  resize(): void;
  dispose(): void;
}

export function createTwinScene(canvas: HTMLCanvasElement, reducedMotion: boolean): TwinScene {
  const ctx = canvas.getContext('2d')!;
  const pts = buildPoints();
  let w = 0, h = 0, scale = 0, cx = 0, cy = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(w, h) * 0.3;
    cx = w / 2;
    cy = h / 2;
  }
  resize();

  const toX = (x: number) => cx + x * scale;
  const toY = (y: number) => cy + y * scale;

  /** Horizontal separation of the two halves, in unit space. */
  function splitAt(t: number) {
    if (reducedMotion) return 0;
    if (t < T.formEnd) return 0.42;
    // Converge over the 0.5s before the snap.
    return 0.42 * (1 - easeInOutCubic(clamp01((t - T.formEnd) / (T.snap - T.formEnd))));
  }

  function wheelPath(p: Path2D, radius: number) {
    p.arc(0, 0, radius, 0, Math.PI * 2);
  }

  /** The assembled wheel as vector art, faded in as the points land. */
  function drawWheel(t: number, alpha: number, split: number) {
    const spokes = new Path2D();
    for (let s = 0; s < 5; s++) {
      const a = (s / 5) * Math.PI * 2 - Math.PI / 2;
      const spread = 0.075;
      const x0 = Math.cos(a) * 0.2, y0 = Math.sin(a) * 0.2;
      const x1 = Math.cos(a) * 0.86, y1 = Math.sin(a) * 0.86;
      const nx = -Math.sin(a), ny = Math.cos(a);
      spokes.moveTo(x0 + nx * spread, y0 + ny * spread);
      spokes.lineTo(x1 + nx * spread * 0.45, y1 + ny * spread * 0.45);
      spokes.lineTo(x1 - nx * spread * 0.45, y1 - ny * spread * 0.45);
      spokes.lineTo(x0 - nx * spread, y0 - ny * spread);
      spokes.closePath();
    }

    const rims = new Path2D();
    wheelPath(rims, 1.0);
    const inner = new Path2D();
    wheelPath(inner, 0.86);
    const hub = new Path2D();
    wheelPath(hub, 0.2);

    // --- physical half: shaded solid, clipped to the right of centre ---
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(cx, 0, w - cx, h);
    ctx.clip();
    ctx.translate(toX(split), cy);
    ctx.scale(scale, scale);

    const grad = ctx.createLinearGradient(-1, -1, 1, 1);
    grad.addColorStop(0, '#d8d8d8');
    grad.addColorStop(0.45, '#8e8e8e');
    grad.addColorStop(1, '#3a3a3a');
    ctx.fillStyle = grad;
    ctx.fill(rims);
    ctx.fillStyle = '#121212';
    ctx.fill(inner);
    ctx.fillStyle = grad;
    ctx.fill(spokes);
    ctx.fill(hub);
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke(rims);
    ctx.restore();

    // --- digital half: wireframe, clipped to the left of centre ---
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(0, 0, cx, h);
    ctx.clip();
    ctx.translate(toX(-split), cy);
    ctx.scale(scale, scale);

    ctx.lineWidth = 1.6 / scale;
    ctx.strokeStyle = GREEN;
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 14;
    ctx.setLineDash([0.05, 0.03]);
    ctx.lineDashOffset = -t * 0.35;
    ctx.stroke(rims);
    ctx.stroke(inner);
    ctx.setLineDash([]);
    ctx.stroke(spokes);
    ctx.stroke(hub);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawPoints(t: number, split: number) {
    const p = clamp01((t - T.form) / (T.formEnd - T.form));
    ctx.save();
    for (const pt of pts) {
      const local = easeOutCubic(clamp01((p - pt.delay) / (1 - pt.delay || 1)));
      if (local <= 0) continue;
      const ox = pt.side * split;
      const x = toX((pt.sx + (pt.tx + ox - pt.sx) * local));
      const y = toY((pt.sy + (pt.ty - pt.sy) * local));
      const landed = local > 0.985;
      ctx.globalAlpha = landed ? 0.5 : 0.35 + local * 0.5;
      ctx.fillStyle = pt.side === -1 ? GREEN_HI : '#e8e8e8';
      const r = landed ? 0.9 : 1.6 - local * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Vertical scanline that sweeps the part just before the snap. */
  function drawScan(t: number) {
    const p = clamp01((t - T.scan) / SCAN_DUR);
    if (p <= 0 || p >= 1) return;
    const x = cx + (p * 2 - 1) * scale * 1.7;
    const g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    g.addColorStop(0, 'rgba(134,254,76,0)');
    g.addColorStop(0.5, `rgba(154,255,97,${0.5 * Math.sin(p * Math.PI)})`);
    g.addColorStop(1, 'rgba(134,254,76,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 34, 0, 68, h);
  }

  /** White-hot flash and expanding ring at the moment the halves merge. */
  function drawSnap(t: number) {
    const p = clamp01((t - T.snap) / SNAP_DUR);
    if (p <= 0 || p >= 1) return;
    const fade = 1 - p;

    ctx.save();
    ctx.globalAlpha = fade * fade * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    const r = scale * (1 + easeOutCubic(p) * 2.1);
    ctx.globalAlpha = fade * 0.85;
    ctx.strokeStyle = GREEN_HI;
    ctx.lineWidth = 3 * fade + 0.5;
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function draw(t: number) {
    ctx.clearRect(0, 0, w, h);

    if (reducedMotion) {
      // No assembly, no flash: the finished part, held still.
      drawWheel(0, 1, 0);
      return;
    }

    const split = splitAt(t);
    const assembled = clamp01((t - (T.formEnd - 2.0)) / 2.2);

    drawPoints(t, split);
    if (assembled > 0) drawWheel(t, assembled, split);
    drawScan(t);
    drawSnap(t);

    // Slow rotation once it is one object, so the hold is not static.
    if (t > T.snap) {
      const spin = (t - T.snap) * 0.06;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.translate(-cx, -cy);
      ctx.restore();
    }
  }

  return { draw, resize, dispose: () => undefined };
}

export const TIMELINE = T;

import Matter from 'matter-js';
import { WORLD_H, WORLD_W, getParam, getTag, rad, type Part, type Tag } from './parts.ts';
import type { Simulation } from './sim.ts';

const { Constraint } = Matter;

export interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
  dpr: number;
}

export interface DrawOptions {
  mode: 'edit' | 'run';
  /** Seconds, used for animations. */
  clock: number;
  selectedId: string | null;
  hoverId: string | null;
  grab?: { from: Matter.Vector; to: Matter.Vector } | null;
}

const C = {
  paper: '#f7f2e8',
  grid: 'rgba(120, 96, 60, 0.07)',
  gridMajor: 'rgba(120, 96, 60, 0.14)',
  ground: '#6b4f36',
  groundTop: '#8a6a4a',
  wood: '#c08552',
  woodDark: '#7a5230',
  ball: '#e4572e',
  ballDark: '#a8361a',
  bowling: '#2d3142',
  crate: '#dda15e',
  crateDark: '#8c5a2b',
  domino: '#fffdf7',
  ink: '#22252b',
  seesaw: '#2a9d8f',
  seesawDark: '#1d6f65',
  steel: '#7d8597',
  steelDark: '#4a5162',
  brass: '#d4a72c',
  brassDark: '#8f6c12',
  wheel: '#e9c46a',
  wheelDark: '#a9832a',
  hub: '#264653',
  bouncer: '#ef476f',
  bouncerDark: '#a3203f',
  belt: '#343a40',
  beltMark: '#ffd166',
  fan: '#577590',
  fanDark: '#34495e',
  air: 'rgba(80, 160, 230, 0.10)',
  airStreak: 'rgba(60, 140, 220, 0.45)',
  bell: '#f4c430',
  bellDark: '#9a7400',
  bucket: '#8d99ae',
  bucketDark: '#4f5b70',
  goal: 'rgba(46, 196, 120, 0.18)',
  goalHit: 'rgba(46, 196, 120, 0.45)',
  select: '#3a6df0',
};

export function fitView(cssW: number, cssH: number, dpr: number): View {
  const scale = Math.min(cssW / WORLD_W, cssH / WORLD_H);
  return { scale, offsetX: (cssW - WORLD_W * scale) / 2, offsetY: (cssH - WORLD_H * scale) / 2, dpr };
}

export function screenToWorld(view: View, sx: number, sy: number): Matter.Vector {
  return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
}

function path(ctx: CanvasRenderingContext2D, verts: Matter.Vector[]) {
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
  ctx.closePath();
}

function fillStroke(ctx: CanvasRenderingContext2D, fill: string, stroke: string, width = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function polyParts(body: Matter.Body): Matter.Body[] {
  return body.parts.length > 1 ? body.parts.slice(1) : [body];
}

function drawBackground(ctx: CanvasRenderingContext2D, mode: 'edit' | 'run') {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 20) {
    ctx.strokeStyle = x % 100 === 0 ? C.gridMajor : C.grid;
    if (mode === 'run' && x % 100 !== 0) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += 20) {
    ctx.strokeStyle = y % 100 === 0 ? C.gridMajor : C.grid;
    if (mode === 'run' && y % 100 !== 0) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
}

function drawGround(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.ground;
  ctx.fillRect(-50, WORLD_H, WORLD_W + 100, 80);
  ctx.fillStyle = C.groundTop;
  ctx.fillRect(-50, WORLD_H - 4, WORLD_W + 100, 6);
}

/** Draws every body of a simulation (or a loose list of bodies for previews and icons). */
export function drawBodies(
  ctx: CanvasRenderingContext2D,
  bodies: Matter.Body[],
  constraints: Matter.Constraint[],
  parts: Map<string, Part>,
  opts: DrawOptions,
  sim?: Simulation,
) {
  // Air zones go underneath everything else.
  for (const b of bodies) {
    const t = getTag(b);
    if (t?.role === 'fanZone') drawFanZone(ctx, b, parts.get(t.partId), opts.clock);
    if (t?.role === 'goal') {
      const hit = sim?.goalPartId === t.partId;
      path(ctx, b.vertices);
      ctx.fillStyle = hit ? C.goalHit : C.goal;
      ctx.fill();
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = hit ? '#1d8a53' : 'rgba(29, 138, 83, 0.55)';
      ctx.font = `bold ${hit ? 22 : 13}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hit ? '★' : 'GOAL', 0, 1);
      ctx.restore();
    }
  }
  for (const c of constraints) {
    if (c.label === 'rope') {
      const a = Constraint.pointAWorld(c);
      const bpt = Constraint.pointBWorld(c);
      ctx.strokeStyle = '#5c4a3a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bpt.x, bpt.y);
      ctx.stroke();
    }
  }
  for (const b of bodies) {
    const t = getTag(b);
    if (!t || t.role === 'fanZone' || t.role === 'goal' || t.role === 'boundary') continue;
    drawBody(ctx, b, t, parts.get(t.partId), opts, sim);
  }
  for (const c of constraints) {
    if (c.label === 'pin' || c.label === 'rope') drawBolt(ctx, Constraint.pointAWorld(c));
  }
}

function drawBolt(ctx: CanvasRenderingContext2D, p: Matter.Vector) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  fillStroke(ctx, '#d9d9d9', '#555', 2);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#555';
  ctx.fill();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  b: Matter.Body,
  t: Tag,
  part: Part | undefined,
  opts: DrawOptions,
  sim?: Simulation,
) {
  switch (t.type) {
    case 'ball':
      return drawBall(ctx, b, C.ball, C.ballDark);
    case 'bowlingBall':
      return drawBowling(ctx, b);
    case 'crate': {
      path(ctx, b.vertices);
      fillStroke(ctx, C.crate, C.crateDark, 2.5);
      const v = b.vertices;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.lineTo(v[2].x, v[2].y);
      ctx.moveTo(v[1].x, v[1].y);
      ctx.lineTo(v[3].x, v[3].y);
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    case 'domino': {
      path(ctx, b.vertices);
      fillStroke(ctx, C.domino, C.ink, 2);
      const up = { x: Math.sin(b.angle), y: -Math.cos(b.angle) };
      const h = Math.hypot(b.vertices[2].x - b.vertices[1].x, b.vertices[2].y - b.vertices[1].y) / 2;
      ctx.fillStyle = C.ink;
      for (const k of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.arc(b.position.x + up.x * h * k * 0.9, b.position.y + up.y * h * k * 0.9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'plank':
      path(ctx, b.vertices);
      fillStroke(ctx, C.wood, C.woodDark, 2);
      return;
    case 'seesaw':
      path(ctx, b.vertices);
      if (t.role === 'fulcrum') fillStroke(ctx, C.steel, C.steelDark, 2);
      else fillStroke(ctx, C.seesaw, C.seesawDark, 2);
      return;
    case 'pendulum':
      if (t.role === 'pivot') return;
      return drawBall(ctx, b, C.brass, C.brassDark, false);
    case 'wheel':
      for (const p of polyParts(b)) {
        path(ctx, p.vertices);
        if (p.circleRadius) fillStroke(ctx, C.hub, '#152a33', 2);
        else fillStroke(ctx, C.wheel, C.wheelDark, 2);
      }
      return;
    case 'bouncer': {
      path(ctx, b.vertices);
      fillStroke(ctx, C.bouncer, C.bouncerDark, 2);
      const v = b.vertices;
      // Zig-zag spring along the pad.
      const a = v[0];
      const c = v[1];
      const d = v[3];
      const n = Math.max(4, Math.round(Math.hypot(c.x - a.x, c.y - a.y) / 14));
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const k = i % 2 ? 0.25 : 0.75;
        const x = a.x + (c.x - a.x) * f + (d.x - a.x) * k;
        const y = a.y + (c.y - a.y) * f + (d.y - a.y) * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    case 'conveyor':
      return drawConveyor(ctx, b, part, opts);
    case 'fan':
      return drawFanHousing(ctx, b, part, opts.clock);
    case 'bell':
      return drawBell(ctx, b, t, sim);
    case 'bucket':
      for (const p of polyParts(b)) {
        path(ctx, p.vertices);
        fillStroke(ctx, C.bucket, C.bucketDark, 2);
      }
      if (part) drawFlag(ctx, part, sim?.goalPartId === t.partId, opts.clock);
      return;
  }
}

function drawBall(ctx: CanvasRenderingContext2D, b: Matter.Body, fill: string, dark: string, stripe = true) {
  const r = b.circleRadius ?? 10;
  const { x, y } = b.position;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, fill);
  g.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = dark;
  ctx.stroke();
  if (stripe) {
    const a = b.angle + (b.plugin.spin ?? 0);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, a - 0.6, a + 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}

function drawBowling(ctx: CanvasRenderingContext2D, b: Matter.Body) {
  const r = b.circleRadius ?? 24;
  const { x, y } = b.position;
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#6b7394');
  g.addColorStop(1, C.bowling);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  const a = b.angle + (b.plugin.spin ?? 0);
  ctx.fillStyle = '#11131a';
  for (const [dx, dy, s] of [
    [0.3, -0.35, 0.13],
    [0.52, -0.08, 0.13],
    [0.12, 0.05, 0.15],
  ]) {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    ctx.beginPath();
    ctx.arc(x + (dx * c - dy * sn) * r, y + (dx * sn + dy * c) * r, s * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawConveyor(ctx: CanvasRenderingContext2D, b: Matter.Body, part: Part | undefined, opts: DrawOptions) {
  path(ctx, b.vertices);
  fillStroke(ctx, C.belt, '#16191c', 2);
  if (!part) return;
  const a = rad(part.angle);
  const L = getParam(part, 'length');
  const speed = getParam(part, 'speed');
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const { x, y } = b.position;
  const shift = opts.mode === 'run' ? (opts.clock * speed * 60) % 24 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.rect(-L / 2 + 9, -9, L - 18, 18);
  ctx.clip();
  ctx.strokeStyle = C.beltMark;
  ctx.lineWidth = 2;
  const s = Math.sign(speed) || 1;
  for (let i = -L / 2 - 24; i < L / 2 + 24; i += 24) {
    const cx = i + shift;
    ctx.beginPath();
    ctx.moveTo(cx - 3 * s, -5);
    ctx.lineTo(cx + 3 * s, 0);
    ctx.lineTo(cx - 3 * s, 5);
    ctx.stroke();
  }
  ctx.restore();
  for (const k of [-1, 1]) {
    const cx = x + dir.x * (L / 2 - 9) * k;
    const cy = y + dir.y * (L / 2 - 9) * k;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    fillStroke(ctx, '#adb5bd', '#16191c', 1.5);
  }
}

function drawFanZone(ctx: CanvasRenderingContext2D, zone: Matter.Body, part: Part | undefined, clock: number) {
  path(ctx, zone.vertices);
  ctx.fillStyle = C.air;
  ctx.fill();
  if (!part) return;
  const a = rad(part.angle);
  const reach = getParam(part, 'reach');
  const strength = getParam(part, 'strength');
  ctx.save();
  ctx.translate(part.x, part.y);
  ctx.rotate(a);
  ctx.strokeStyle = C.airStreak;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -clock * (30 + strength * 12);
  for (const off of [-30, -10, 10, 30]) {
    ctx.beginPath();
    ctx.moveTo(18, off);
    for (let d = 18; d <= 15 + reach; d += 12) ctx.lineTo(d, off + Math.sin(d / 26 + off + clock * 3) * 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFanHousing(ctx: CanvasRenderingContext2D, b: Matter.Body, part: Part | undefined, clock: number) {
  path(ctx, b.vertices);
  fillStroke(ctx, C.fan, C.fanDark, 2);
  if (!part) return;
  const a = rad(part.angle);
  const strength = getParam(part, 'strength');
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(a);
  // Spinning blades seen side-on: a squashed ellipse that flickers.
  const phase = Math.sin(clock * (10 + strength * 4));
  ctx.fillStyle = '#d6e4f0';
  ctx.beginPath();
  ctx.ellipse(16, 0, 5, 22 * Math.abs(phase) + 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.fanDark;
  ctx.beginPath();
  ctx.arc(10, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBell(ctx: CanvasRenderingContext2D, b: Matter.Body, t: Tag, sim?: Simulation) {
  const { x, y } = b.position;
  const last = sim?.bellRings.get(t.partId);
  const since = last === undefined || !sim ? Infinity : (sim.time - last) / 1000;
  const swing = since < 1.2 ? Math.sin(since * 22) * 0.35 * (1 - since / 1.2) : 0;
  if (since < 1) {
    for (let i = 0; i < 3; i++) {
      const f = since * 1.4 + i * 0.22;
      if (f > 1) continue;
      ctx.beginPath();
      ctx.arc(x, y, 22 + f * 40, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(244, 196, 48, ${0.7 * (1 - f)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(x, y - 20);
  ctx.rotate(swing);
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.quadraticCurveTo(-8, -2, 0, -3);
  ctx.quadraticCurveTo(8, -2, 6, 4);
  ctx.moveTo(-14, 10);
  ctx.bezierCurveTo(-16, -6, 16, -6, 14, 10);
  ctx.lineTo(18, 34);
  ctx.quadraticCurveTo(0, 40, -18, 34);
  ctx.closePath();
  const g = ctx.createLinearGradient(-18, 0, 18, 0);
  g.addColorStop(0, C.bellDark);
  g.addColorStop(0.35, '#ffe27a');
  g.addColorStop(1, C.bell);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = C.bellDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 38, 4, 0, Math.PI * 2);
  ctx.fillStyle = C.bellDark;
  ctx.fill();
  ctx.restore();
}

function drawFlag(ctx: CanvasRenderingContext2D, part: Part, hit: boolean, clock: number) {
  const w = getParam(part, 'width');
  const a = rad(part.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Pole on the right rim of the bucket.
  const lx = w / 2 - 5;
  const ly = -40;
  const px = part.x + lx * c - ly * s;
  const py = part.y + lx * s + ly * c;
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px, py - 46);
  ctx.stroke();
  const wave = Math.sin(clock * 5) * 3;
  ctx.beginPath();
  ctx.moveTo(px, py - 46);
  ctx.quadraticCurveTo(px + 14, py - 46 + wave, px + 28, py - 40);
  ctx.lineTo(px, py - 30);
  ctx.closePath();
  ctx.fillStyle = hit ? '#2ec478' : '#ff6b35';
  ctx.fill();
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  bounds: Matter.Bounds,
  rotatable: boolean,
  color: string,
  scale: number,
): { handle: Matter.Vector | null } {
  const pad = 6;
  const x = bounds.min.x - pad;
  const y = bounds.min.y - pad;
  const w = bounds.max.x - bounds.min.x + pad * 2;
  const h = bounds.max.y - bounds.min.y + pad * 2;
  ctx.save();
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
  if (!rotatable) return { handle: null };
  const handle = { x: x + w / 2, y: y - 26 / scale };
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / scale;
  ctx.beginPath();
  ctx.moveTo(handle.x, y);
  ctx.lineTo(handle.x, handle.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(handle.x, handle.y, 7 / scale, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.stroke();
  return { handle };
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  opts: DrawOptions,
): void {
  const parts = new Map(sim.design.parts.map((p) => [p.id, p]));
  drawBackground(ctx, opts.mode);
  drawGround(ctx);
  drawBodies(ctx, sim.bodies, sim.constraints, parts, opts, sim);
  if (opts.grab) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(opts.grab.from.x, opts.grab.from.y);
    ctx.lineTo(opts.grab.to.x, opts.grab.to.y);
    ctx.stroke();
    ctx.restore();
  }
}

export const SELECT_COLOR = C.select;

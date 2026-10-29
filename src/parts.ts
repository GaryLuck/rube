import Matter from 'matter-js';

const { Bodies, Body, Constraint } = Matter;

export const WORLD_W = 1200;
export const WORLD_H = 700;

export type PartType =
  | 'ball'
  | 'bowlingBall'
  | 'crate'
  | 'domino'
  | 'plank'
  | 'seesaw'
  | 'pendulum'
  | 'wheel'
  | 'bouncer'
  | 'conveyor'
  | 'fan'
  | 'bell'
  | 'bucket';

export interface Part {
  id: string;
  type: PartType;
  x: number;
  y: number;
  /** Degrees, clockwise (canvas y points down). */
  angle: number;
  params: Record<string, number>;
}

export interface Design {
  version: 1;
  name: string;
  description?: string;
  parts: Part[];
}

export type Role =
  | 'body'
  | 'goal'
  | 'fanZone'
  | 'fanHousing'
  | 'conveyor'
  | 'bell'
  | 'fulcrum'
  | 'pivot'
  | 'bouncer'
  | 'boundary';

export interface Tag {
  partId: string;
  type: PartType | 'boundary';
  role: Role;
}

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface Built {
  bodies: Matter.Body[];
  constraints: Matter.Constraint[];
}

export type Category = 'Movers' | 'Structure' | 'Gadgets' | 'Goal';

export interface PartDef {
  type: PartType;
  label: string;
  category: Category;
  description: string;
  rotatable: boolean;
  defaultAngle?: number;
  params: ParamDef[];
  build(p: Part): Built;
}

export const rad = (deg: number) => (deg * Math.PI) / 180;

export function rot(lx: number, ly: number, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: lx * c - ly * s, y: lx * s + ly * c };
}

export function tag(body: Matter.Body, t: Tag): Matter.Body {
  for (const part of body.parts) part.plugin = { ...part.plugin, rube: t };
  return body;
}

export function getTag(body: Matter.Body): Tag | undefined {
  return (body.plugin?.rube ?? body.parent?.plugin?.rube) as Tag | undefined;
}

/** setStatic() resets restitution/friction, so re-apply the ones we want afterwards. */
function staticRect(x: number, y: number, w: number, h: number, angle: number, extra: Partial<Matter.IBodyDefinition> = {}) {
  const b = Bodies.rectangle(x, y, w, h, { isStatic: true });
  Body.setAngle(b, angle);
  b.friction = extra.friction ?? 0.3;
  b.restitution = extra.restitution ?? 0;
  if (extra.isSensor) b.isSensor = true;
  return b;
}

/**
 * Matter's Bodies.circle uses as few sides as the radius in px, and rolling polygons lose most of
 * their energy at every corner. Balls are therefore smooth polygons with no surface friction: they
 * glide like an ideal rolling ball and the renderer spins them to match.
 */
function ball(x: number, y: number, r: number, opts: Matter.IChamferableBodyDefinition): Matter.Body {
  const b = Bodies.polygon(x, y, 32, r, opts);
  b.circleRadius = r;
  return b;
}

function p(part: Part, key: string): number {
  const def = PART_DEFS[part.type].params.find((d) => d.key === key);
  return part.params[key] ?? def?.default ?? 0;
}

const t = (part: Part, role: Role = 'body'): Tag => ({ partId: part.id, type: part.type, role });

export const PART_DEFS: Record<PartType, PartDef> = {
  ball: {
    type: 'ball',
    label: 'Ball',
    category: 'Movers',
    description: 'A bouncy rubber ball. Give it a push to start your machine.',
    rotatable: false,
    params: [
      { key: 'size', label: 'Radius', min: 8, max: 34, step: 1, default: 14 },
      { key: 'push', label: 'Starting push', min: -15, max: 15, step: 0.5, default: 0 },
    ],
    build(part) {
      const b = ball(part.x, part.y, p(part, 'size'), {
        restitution: 0.35,
        friction: 0,
        frictionAir: 0.0008,
        density: 0.002,
      });
      Body.setVelocity(b, { x: p(part, 'push'), y: 0 });
      return { bodies: [tag(b, t(part))], constraints: [] };
    },
  },
  bowlingBall: {
    type: 'bowlingBall',
    label: 'Bowling ball',
    category: 'Movers',
    description: 'Heavy and unstoppable. Great for launching things off a seesaw.',
    rotatable: false,
    params: [{ key: 'push', label: 'Starting push', min: -15, max: 15, step: 0.5, default: 0 }],
    build(part) {
      const b = ball(part.x, part.y, 24, {
        restitution: 0.05,
        friction: 0,
        frictionAir: 0.0005,
        density: 0.02,
      });
      Body.setVelocity(b, { x: p(part, 'push'), y: 0 });
      return { bodies: [tag(b, t(part))], constraints: [] };
    },
  },
  crate: {
    type: 'crate',
    label: 'Crate',
    category: 'Movers',
    description: 'A wooden crate that slides and tumbles.',
    rotatable: true,
    params: [{ key: 'size', label: 'Size', min: 24, max: 100, step: 2, default: 44 }],
    build(part) {
      const s = p(part, 'size');
      const b = Bodies.rectangle(part.x, part.y, s, s, { density: 0.0025, friction: 0.5, frictionAir: 0.002, restitution: 0.05 });
      Body.setAngle(b, rad(part.angle));
      return { bodies: [tag(b, t(part))], constraints: [] };
    },
  },
  domino: {
    type: 'domino',
    label: 'Domino',
    category: 'Movers',
    description: 'Line several up and knock the first one over.',
    rotatable: true,
    params: [{ key: 'size', label: 'Height', min: 30, max: 120, step: 2, default: 64 }],
    build(part) {
      const h = p(part, 'size');
      const b = Bodies.rectangle(part.x, part.y, Math.max(8, h * 0.19), h, {
        density: 0.003,
        friction: 0.5,
        frictionAir: 0.001,
        restitution: 0,
      });
      Body.setAngle(b, rad(part.angle));
      return { bodies: [tag(b, t(part))], constraints: [] };
    },
  },
  plank: {
    type: 'plank',
    label: 'Plank',
    category: 'Structure',
    description: 'A fixed board. Use it as a ramp, shelf, floor or wall.',
    rotatable: true,
    params: [{ key: 'length', label: 'Length', min: 30, max: 1000, step: 10, default: 220 }],
    build(part) {
      const b = staticRect(part.x, part.y, p(part, 'length'), 14, rad(part.angle), { friction: 0.2 });
      return { bodies: [tag(b, t(part))], constraints: [] };
    },
  },
  seesaw: {
    type: 'seesaw',
    label: 'Seesaw',
    category: 'Gadgets',
    description: 'A plank balanced on a pivot. Drop something heavy on one end to fling the other.',
    rotatable: true,
    params: [
      { key: 'length', label: 'Length', min: 100, max: 600, step: 10, default: 280 },
      { key: 'pivot', label: 'Pivot offset', min: -0.45, max: 0.45, step: 0.05, default: 0 },
    ],
    build(part) {
      const L = p(part, 'length');
      const a = rad(part.angle);
      const off = rot(p(part, 'pivot') * L, 0, a);
      const group = Body.nextGroup(true);
      const plank = Bodies.rectangle(part.x - off.x, part.y - off.y, L, 14, {
        density: 0.002,
        friction: 0.6,
        frictionAir: 0.002,
        collisionFilter: { group },
      });
      Body.setAngle(plank, a);
      const fh = 50;
      const fulcrum = Bodies.fromVertices(part.x, part.y + 8 + (fh * 2) / 3, [
        [
          { x: 0, y: (-fh * 2) / 3 },
          { x: 28, y: fh / 3 },
          { x: -28, y: fh / 3 },
        ],
      ], { isStatic: true, collisionFilter: { group } });
      fulcrum.friction = 0.5;
      const pin = Constraint.create({
        pointA: { x: part.x, y: part.y },
        bodyB: plank,
        pointB: off,
        length: 0,
        stiffness: 1,
        label: 'pin',
      });
      return {
        bodies: [tag(fulcrum, t(part, 'fulcrum')), tag(plank, t(part))],
        constraints: [pin],
      };
    },
  },
  pendulum: {
    type: 'pendulum',
    label: 'Pendulum',
    category: 'Gadgets',
    description: 'A heavy bob on a rope. Rotate it to set how far it swings back before release.',
    rotatable: true,
    defaultAngle: 60,
    params: [
      { key: 'length', label: 'Rope length', min: 50, max: 450, step: 5, default: 180 },
      { key: 'size', label: 'Bob radius', min: 10, max: 40, step: 1, default: 22 },
    ],
    build(part) {
      const L = p(part, 'length');
      const a = rad(part.angle);
      const bx = part.x + Math.sin(a) * L;
      const by = part.y + Math.cos(a) * L;
      const bob = ball(bx, by, p(part, 'size'), {
        density: 0.01,
        frictionAir: 0,
        friction: 0.1,
        restitution: 0.2,
      });
      const pivot = Bodies.circle(part.x, part.y, 8, {
        isStatic: true,
        isSensor: true,
        collisionFilter: { category: 0, mask: 0 },
      });
      const rope = Constraint.create({
        pointA: { x: part.x, y: part.y },
        bodyB: bob,
        length: L,
        stiffness: 1,
        damping: 0,
        label: 'rope',
      });
      return { bodies: [tag(pivot, t(part, 'pivot')), tag(bob, t(part))], constraints: [rope] };
    },
  },
  wheel: {
    type: 'wheel',
    label: 'Paddle wheel',
    category: 'Gadgets',
    description: 'Spins freely around its axle. Things falling on it make it turn.',
    rotatable: true,
    params: [
      { key: 'size', label: 'Radius', min: 30, max: 160, step: 5, default: 70 },
      { key: 'paddles', label: 'Paddles', min: 2, max: 10, step: 1, default: 6 },
    ],
    build(part) {
      const r = p(part, 'size');
      const n = Math.round(p(part, 'paddles'));
      const a0 = rad(part.angle);
      const hub = Bodies.circle(part.x, part.y, Math.max(10, r * 0.18));
      const parts: Matter.Body[] = [hub];
      for (let i = 0; i < n; i++) {
        const a = a0 + (i * Math.PI * 2) / n;
        const c = rot(r / 2, 0, a);
        const paddle = Bodies.rectangle(part.x + c.x, part.y + c.y, r, 9);
        Body.setAngle(paddle, a);
        parts.push(paddle);
      }
      const wheel = Body.create({ parts, friction: 0.4, frictionAir: 0.01, restitution: 0.1 });
      Body.setDensity(wheel, 0.002);
      // Re-centre on the axle in case of rounding in the centre-of-mass computation.
      Body.setPosition(wheel, { x: part.x, y: part.y });
      const pin = Constraint.create({
        pointA: { x: part.x, y: part.y },
        bodyB: wheel,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: 1,
        label: 'pin',
      });
      return { bodies: [tag(wheel, t(part))], constraints: [pin] };
    },
  },
  bouncer: {
    type: 'bouncer',
    label: 'Trampoline',
    category: 'Structure',
    description: 'A springy pad that bounces things back up.',
    rotatable: true,
    params: [
      { key: 'length', label: 'Length', min: 40, max: 400, step: 10, default: 140 },
      { key: 'bounce', label: 'Springiness', min: 0.5, max: 1.3, step: 0.05, default: 1 },
    ],
    build(part) {
      const b = staticRect(part.x, part.y, p(part, 'length'), 16, rad(part.angle), {
        restitution: p(part, 'bounce'),
        friction: 0.1,
      });
      return { bodies: [tag(b, t(part, 'bouncer'))], constraints: [] };
    },
  },
  conveyor: {
    type: 'conveyor',
    label: 'Conveyor belt',
    category: 'Gadgets',
    description: 'Carries whatever sits on it. Negative speed runs it backwards.',
    rotatable: true,
    params: [
      { key: 'length', label: 'Length', min: 60, max: 800, step: 10, default: 260 },
      { key: 'speed', label: 'Speed', min: -10, max: 10, step: 0.5, default: 3 },
    ],
    build(part) {
      const b = staticRect(part.x, part.y, p(part, 'length'), 18, rad(part.angle), { friction: 0.8 });
      return { bodies: [tag(b, t(part, 'conveyor'))], constraints: [] };
    },
  },
  fan: {
    type: 'fan',
    label: 'Fan',
    category: 'Gadgets',
    description: 'Blows light objects along its airflow. Heavy things barely notice.',
    rotatable: true,
    params: [
      { key: 'reach', label: 'Reach', min: 60, max: 700, step: 10, default: 280 },
      { key: 'strength', label: 'Strength', min: 1, max: 15, step: 0.5, default: 5 },
    ],
    build(part) {
      const a = rad(part.angle);
      const reach = p(part, 'reach');
      const housing = staticRect(part.x, part.y, 30, 54, a, { friction: 0.3 });
      const c = rot(15 + reach / 2, 0, a);
      const zone = staticRect(part.x + c.x, part.y + c.y, reach, 90, a, { isSensor: true });
      return {
        bodies: [tag(zone, t(part, 'fanZone')), tag(housing, t(part, 'fanHousing'))],
        constraints: [],
      };
    },
  },
  bell: {
    type: 'bell',
    label: 'Bell',
    category: 'Gadgets',
    description: 'Dings when anything hits it.',
    rotatable: false,
    params: [],
    build(part) {
      const b = Bodies.circle(part.x, part.y, 20, { isStatic: true });
      b.restitution = 0.5;
      b.friction = 0.1;
      return { bodies: [tag(b, t(part, 'bell'))], constraints: [] };
    },
  },
  bucket: {
    type: 'bucket',
    label: 'Goal bucket',
    category: 'Goal',
    description: 'Get anything to land inside to complete the machine.',
    rotatable: true,
    params: [{ key: 'width', label: 'Width', min: 60, max: 300, step: 5, default: 120 }],
    build(part) {
      const w = p(part, 'width');
      const h = 80;
      const th = 10;
      const a = rad(part.angle);
      const at = (lx: number, ly: number) => {
        const o = rot(lx, ly, a);
        return { x: part.x + o.x, y: part.y + o.y };
      };
      const piece = (lx: number, ly: number, pw: number, ph: number) => {
        const c = at(lx, ly);
        const b = Bodies.rectangle(c.x, c.y, pw, ph);
        Body.setAngle(b, a);
        return b;
      };
      const bucket = Body.create({
        parts: [piece(0, h / 2 - th / 2, w, th), piece(-w / 2 + th / 2, 0, th, h), piece(w / 2 - th / 2, 0, th, h)],
        isStatic: true,
      });
      bucket.friction = 0.6;
      for (const pt of bucket.parts) pt.friction = 0.6;
      const sTop = -h / 2 + h * 0.35;
      const sBottom = h / 2 - th;
      const sc = at(0, (sTop + sBottom) / 2);
      const sensor = Bodies.rectangle(sc.x, sc.y, w - th * 2 - 4, sBottom - sTop, { isStatic: true, isSensor: true });
      Body.setAngle(sensor, a);
      return { bodies: [tag(bucket, t(part)), tag(sensor, t(part, 'goal'))], constraints: [] };
    },
  },
};

export const PART_ORDER: PartType[] = [
  'ball',
  'bowlingBall',
  'crate',
  'domino',
  'plank',
  'bouncer',
  'seesaw',
  'pendulum',
  'wheel',
  'conveyor',
  'fan',
  'bell',
  'bucket',
];

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `p${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function createPart(type: PartType, x: number, y: number): Part {
  const def = PART_DEFS[type];
  const params: Record<string, number> = {};
  for (const d of def.params) params[d.key] = d.default;
  return { id: newId(), type, x, y, angle: def.defaultAngle ?? 0, params };
}

export function getParam(part: Part, key: string): number {
  return p(part, key);
}

/** Validates and normalises an untrusted design (e.g. an imported file or shared link). */
export function sanitizeDesign(raw: unknown): Design {
  if (!raw || typeof raw !== 'object') throw new Error('Not a machine file');
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.parts)) throw new Error('Machine has no parts list');
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const parts: Part[] = [];
  for (const item of r.parts as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    if (typeof it.type !== 'string' || !(it.type in PART_DEFS)) continue;
    const def = PART_DEFS[it.type as PartType];
    const params: Record<string, number> = {};
    const rawParams = (it.params && typeof it.params === 'object' ? it.params : {}) as Record<string, unknown>;
    for (const d of def.params) params[d.key] = Math.min(d.max, Math.max(d.min, num(rawParams[d.key], d.default)));
    parts.push({
      id: typeof it.id === 'string' && it.id ? it.id : newId(),
      type: def.type,
      x: num(it.x, WORLD_W / 2),
      y: num(it.y, WORLD_H / 2),
      angle: num(it.angle, def.defaultAngle ?? 0),
      params,
    });
  }
  const ids = new Set<string>();
  for (const part of parts) {
    if (ids.has(part.id)) part.id = newId();
    ids.add(part.id);
  }
  return {
    version: 1,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 80) : 'Untitled machine',
    description: typeof r.description === 'string' ? r.description.slice(0, 400) : undefined,
    parts,
  };
}

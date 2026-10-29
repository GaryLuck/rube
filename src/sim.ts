import Matter from 'matter-js';
import { PART_DEFS, WORLD_H, WORLD_W, getParam, getTag, rad, tag, type Design, type Part } from './parts.ts';

const { Engine, Composite, Bodies, Body, Events, Query, Vector } = Matter;

export const STEP_MS = 1000 / 60;

export interface SimEvents {
  goal?(partId: string, timeMs: number): void;
  bell?(partId: string): void;
  impact?(speed: number): void;
}

interface FanEffect {
  part: Part;
  zone: Matter.Body;
}

interface ConveyorEffect {
  part: Part;
  belt: Matter.Body;
}

/**
 * A physics world built from a Design. In edit mode it is never stepped and is
 * only used for drawing and hit-testing; in run mode it is stepped at a fixed rate.
 */
export class Simulation {
  readonly engine: Matter.Engine;
  readonly design: Design;
  readonly bodiesByPart = new Map<string, Matter.Body[]>();
  readonly constraints: Matter.Constraint[] = [];
  time = 0;
  goalReachedAt: number | null = null;
  goalPartId: string | null = null;
  readonly bellRings = new Map<string, number>();
  private fans: FanEffect[] = [];
  private conveyors: ConveyorEffect[] = [];
  private events: SimEvents;
  private dynamicCache: Matter.Body[] = [];

  constructor(design: Design, events: SimEvents = {}) {
    this.design = design;
    this.events = events;
    this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
    this.engine.gravity.y = 1;
    const world = this.engine.world;

    const floor = Bodies.rectangle(WORLD_W / 2, WORLD_H + 30, WORLD_W * 3, 60, { isStatic: true });
    floor.friction = 0.6;
    const left = Bodies.rectangle(-30, WORLD_H / 2 - 600, 60, WORLD_H + 1200, { isStatic: true });
    const right = Bodies.rectangle(WORLD_W + 30, WORLD_H / 2 - 600, 60, WORLD_H + 1200, { isStatic: true });
    for (const b of [floor, left, right]) {
      tag(b, { partId: '', type: 'boundary', role: 'boundary' });
      Composite.add(world, b);
    }

    for (const part of design.parts) {
      const built = PART_DEFS[part.type].build(part);
      this.bodiesByPart.set(part.id, built.bodies);
      Composite.add(world, built.bodies);
      Composite.add(world, built.constraints);
      this.constraints.push(...built.constraints);
      for (const b of built.bodies) {
        const t = getTag(b);
        if (t?.role === 'fanZone') this.fans.push({ part, zone: b });
        if (t?.role === 'conveyor') this.conveyors.push({ part, belt: b });
      }
    }
    this.dynamicCache = Composite.allBodies(world).filter((b) => !b.isStatic);

    Events.on(this.engine, 'beforeUpdate', () => this.applyEffects());
    Events.on(this.engine, 'collisionStart', (e) => this.onCollisions(e.pairs));
  }

  get bodies(): Matter.Body[] {
    return Composite.allBodies(this.engine.world);
  }

  get dynamicBodies(): Matter.Body[] {
    return this.dynamicCache;
  }

  step(dt = STEP_MS) {
    Engine.update(this.engine, dt);
    this.time += dt;
    // Balls are frictionless (see parts.ts), so spin them visually as if they were rolling.
    for (const b of this.dynamicCache) {
      if (b.circleRadius && b.friction === 0) b.plugin.spin = (b.plugin.spin ?? 0) + b.velocity.x / b.circleRadius;
    }
  }

  /** Runs headless until the goal is reached or the time limit passes. */
  runUntilGoal(maxMs: number): number | null {
    while (this.time < maxMs && this.goalReachedAt === null) this.step();
    return this.goalReachedAt;
  }

  private applyEffects() {
    const bodies = this.dynamicCache;
    for (const { part, zone } of this.fans) {
      const a = rad(part.angle);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const reach = getParam(part, 'reach');
      const strength = getParam(part, 'strength');
      for (const c of Query.collides(zone, bodies)) {
        const b = c.bodyA === zone ? c.bodyB : c.bodyA;
        const body = b.parent;
        const along = Vector.dot(Vector.sub(body.position, { x: part.x, y: part.y }), dir);
        const falloff = 1 - 0.6 * Math.min(1, Math.max(0, along / reach));
        // Force scales with area, not mass, so light objects are blown around and heavy ones are not.
        const f = 6e-7 * strength * body.area * falloff;
        Body.applyForce(body, body.position, { x: dir.x * f, y: dir.y * f });
      }
    }
    for (const { part, belt } of this.conveyors) {
      const a = rad(part.angle);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const speed = getParam(part, 'speed');
      for (const c of Query.collides(belt, bodies)) {
        const b = (c.bodyA === belt ? c.bodyB : c.bodyA).parent;
        // Only drive things resting on the belt's top surface.
        const normal = rot90(dir);
        const side = Vector.dot(Vector.sub(b.position, belt.position), normal);
        if (side > 0) continue;
        const vt = Vector.dot(b.velocity, dir);
        const dv = (speed - vt) * 0.2;
        Body.setVelocity(b, { x: b.velocity.x + dir.x * dv, y: b.velocity.y + dir.y * dv });
      }
    }
  }

  private onCollisions(pairs: Matter.Pair[]) {
    for (const pair of pairs) {
      const ta = getTag(pair.bodyA);
      const tb = getTag(pair.bodyB);
      const pa = pair.bodyA.parent;
      const pb = pair.bodyB.parent;
      for (const [t, other] of [
        [ta, pb],
        [tb, pa],
      ] as const) {
        if (!t || other.isStatic) continue;
        if (t.role === 'goal' && this.goalReachedAt === null) {
          this.goalReachedAt = this.time;
          this.goalPartId = t.partId;
          this.events.goal?.(t.partId, this.time);
        }
        if (t.role === 'bell') {
          const last = this.bellRings.get(t.partId) ?? -Infinity;
          if (this.time - last > 150) this.events.bell?.(t.partId);
          this.bellRings.set(t.partId, this.time);
        }
      }
      if (!pair.isSensor) {
        const speed = Vector.magnitude(Vector.sub(pa.velocity, pb.velocity));
        if (speed > 2.5) this.events.impact?.(speed);
      }
    }
  }

  /** Topmost part under a world point, preferring solid bodies over sensor zones. */
  partAt(point: Matter.Vector): string | null {
    const parts = this.design.parts;
    for (const sensorsPass of [false, true]) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const bodies = this.bodiesByPart.get(parts[i].id) ?? [];
        const candidates = bodies.filter((b) => b.isSensor === sensorsPass);
        if (Query.point(candidates, point).length) return parts[i].id;
      }
    }
    return null;
  }

  dynamicBodyAt(point: Matter.Vector): Matter.Body | null {
    const hits = Query.point(this.dynamicCache, point);
    return hits.length ? hits[0] : null;
  }

  partBounds(partId: string): Matter.Bounds | null {
    const bodies = this.bodiesByPart.get(partId);
    if (!bodies?.length) return null;
    const out = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
    // Fan airflow is large and see-through, so it doesn't count towards the selection box.
    const solid = bodies.filter((b) => getTag(b)?.role !== 'fanZone');
    for (const b of solid.length ? solid : bodies) {
      out.min.x = Math.min(out.min.x, b.bounds.min.x);
      out.min.y = Math.min(out.min.y, b.bounds.min.y);
      out.max.x = Math.max(out.max.x, b.bounds.max.x);
      out.max.y = Math.max(out.max.y, b.bounds.max.y);
    }
    return out;
  }
}

function rot90(v: Matter.Vector): Matter.Vector {
  return { x: -v.y, y: v.x };
}

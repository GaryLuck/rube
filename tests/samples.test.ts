import { describe, expect, it } from 'vitest';
import { PART_DEFS, PART_ORDER, createPart, sanitizeDesign, type Design } from '../src/parts.ts';
import { SAMPLES } from '../src/samples.ts';
import { Simulation } from '../src/sim.ts';
import { decodeShare, encodeShare } from '../src/storage.ts';

function perturbed(design: Design, seed: number): Design {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const d = structuredClone(design);
  for (const p of d.parts) {
    p.x += rnd() * 0.5;
    p.y += rnd() * 0.2;
    p.angle += rnd() * 0.05;
  }
  return d;
}

describe('sample machines', () => {
  it('ships four samples, each with a goal', () => {
    expect(SAMPLES).toHaveLength(4);
    for (const s of SAMPLES) expect(s.parts.some((p) => p.type === 'bucket')).toBe(true);
  });

  for (const sample of SAMPLES) {
    describe(sample.name, () => {
      it('reaches the goal', () => {
        const sim = new Simulation(structuredClone(sample));
        expect(sim.runUntilGoal(30_000)).not.toBeNull();
      });

      // Browsers can differ in the last bits of Math.sin/cos, so a sample must not depend on
      // an exact trajectory.
      it('still reaches the goal when nudged slightly', () => {
        let ok = 0;
        for (let seed = 1; seed <= 10; seed++) {
          const sim = new Simulation(perturbed(sample, seed * 7919));
          if (sim.runUntilGoal(30_000) !== null) ok++;
        }
        expect(ok).toBeGreaterThanOrEqual(9);
      });
    });
  }

  it('rings every bell in Chime Cascade', () => {
    const sample = SAMPLES.find((s) => s.name === 'Chime Cascade')!;
    const rung = new Set<string>();
    const sim = new Simulation(structuredClone(sample), { bell: (id) => rung.add(id) });
    sim.runUntilGoal(30_000);
    expect(rung.size).toBe(sample.parts.filter((p) => p.type === 'bell').length);
  });
});

describe('parts', () => {
  it('builds every part type with its defaults', () => {
    for (const type of PART_ORDER) {
      const part = createPart(type, 300, 300);
      const built = PART_DEFS[type].build(part);
      expect(built.bodies.length).toBeGreaterThan(0);
    }
  });

  it('a lone ball falls and comes to rest on the floor', () => {
    const sim = new Simulation({ version: 1, name: 't', parts: [createPart('ball', 600, 100)] });
    for (let i = 0; i < 600; i++) sim.step();
    const ball = sim.dynamicBodies[0];
    expect(ball.position.y).toBeGreaterThan(660);
    expect(ball.position.y).toBeLessThan(700);
  });

  it('a fan lifts a ball placed in its airflow', () => {
    const fan = createPart('fan', 600, 680);
    fan.angle = -90;
    fan.params.strength = 10;
    const sim = new Simulation({ version: 1, name: 't', parts: [fan, createPart('ball', 600, 560)] });
    for (let i = 0; i < 90; i++) sim.step();
    expect(sim.dynamicBodies[0].position.y).toBeLessThan(560);
  });

  it('a conveyor carries a crate in the direction of its speed', () => {
    const belt = createPart('conveyor', 600, 500);
    belt.params.speed = -4;
    const crate = createPart('crate', 600, 460);
    const sim = new Simulation({ version: 1, name: 't', parts: [belt, crate] });
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.dynamicBodies[0].position.x).toBeLessThan(560);
  });

  it('finds the part under a point', () => {
    const plank = createPart('plank', 400, 300);
    const sim = new Simulation({ version: 1, name: 't', parts: [plank] });
    expect(sim.partAt({ x: 400, y: 300 })).toBe(plank.id);
    expect(sim.partAt({ x: 400, y: 340 })).toBeNull();
  });
});

describe('design files', () => {
  it('sanitizes untrusted input', () => {
    const d = sanitizeDesign({
      name: 'X',
      parts: [
        { type: 'ball', x: 10, y: 20, params: { size: 999 } },
        { type: 'rocket', x: 1, y: 1 },
        { type: 'plank', x: 'nope', y: 5, angle: 30 },
        'garbage',
      ],
    });
    expect(d.parts).toHaveLength(2);
    expect(d.parts[0].params.size).toBe(PART_DEFS.ball.params[0].max);
    expect(d.parts[1].x).toBe(600);
    expect(d.parts[1].angle).toBe(30);
    expect(() => sanitizeDesign({ nope: true })).toThrow();
  });

  it('round-trips through a share link', () => {
    const d = decodeShare(encodeShare(SAMPLES[2]));
    expect(d.name).toBe(SAMPLES[2].name);
    expect(d.parts.map((p) => [p.type, p.x, p.y])).toEqual(SAMPLES[2].parts.map((p) => [p.type, p.x, p.y]));
  });
});

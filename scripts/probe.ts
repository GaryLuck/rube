// Traces a sample headlessly, for tuning: node scripts/probe.ts <sampleIndex> [seconds] [partIds...]
import { SAMPLES } from '../src/samples.ts';
import { Simulation } from '../src/sim.ts';

const idx = Number(process.argv[2] ?? 0);
const secs = Number(process.argv[3] ?? 20);
const only = process.argv.slice(4);
const design = SAMPLES[idx];
const sim = new Simulation(design, {
  goal: (id, t) => console.log(`GOAL ${id} at ${(t / 1000).toFixed(2)}s`),
  bell: (id) => console.log(`bell ${id} at ${(sim.time / 1000).toFixed(2)}s`),
});
console.log(`# ${design.name}`);
let next = 0;
while (sim.time < secs * 1000) {
  sim.step();
  if (sim.time >= next) {
    next += Number(process.env.DT ?? 500);
    const rows: string[] = [];
    for (const p of design.parts) {
      if (only.length && !only.includes(p.id)) continue;
      for (const b of sim.bodiesByPart.get(p.id) ?? []) {
        if (b.isStatic) continue;
        rows.push(`${p.id}:${p.type[0]}(${b.position.x.toFixed(0)},${b.position.y.toFixed(0)} ${(b.angle * 57.3).toFixed(0)}°)`);
      }
    }
    console.log(`${(sim.time / 1000).toFixed(1)}s ${rows.join(' ')}`);
  }
}

// Checks each sample reaches its goal, also under tiny random perturbations: node scripts/robust.ts [idx] [trials]
import { SAMPLES } from '../src/samples.ts';
import { Simulation } from '../src/sim.ts';
const only = process.argv[2] !== undefined && process.argv[2] !== 'all' ? [Number(process.argv[2])] : SAMPLES.map((_, i) => i);
const trials = Number(process.argv[3] ?? 20);
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (const i of only) {
  const times: string[] = [];
  let ok = 0;
  for (let t = 0; t < trials; t++) {
    const d = structuredClone(SAMPLES[i]);
    if (t > 0) for (const p of d.parts) { p.x += rnd() * 0.5; p.y += rnd() * 0.2; p.angle += rnd() * 0.05; }
    const sim = new Simulation(d);
    const g = sim.runUntilGoal(40000);
    if (g !== null) ok++;
    times.push(g === null ? 'x' : (g / 1000).toFixed(1));
  }
  console.log(`${SAMPLES[i].name}: ${ok}/${trials}  ${times.join(' ')}`);
}

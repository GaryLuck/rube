import type { Design, Part, PartType } from './parts.ts';

let n = 0;
function part(type: PartType, x: number, y: number, angle = 0, params: Record<string, number> = {}): Part {
  n += 1;
  return { id: `s${n}`, type, x, y, angle, params };
}

function dominoRow(x0: number, y: number, count: number, gap: number, height = 64): Part[] {
  return Array.from({ length: count }, (_, i) => part('domino', x0 + i * gap, y - height / 2, 0, { size: height }));
}

export const SAMPLES: Design[] = [
  {
    version: 1,
    name: 'Domino Rally',
    description: 'A pendulum topples a line of dominoes. The last one nudges a ball off the shelf, down a ramp and into the bucket.',
    parts: [
      part('pendulum', 380, 70, -70, { length: 165, size: 18 }),
      part('plank', 541.5, 300, 0, { length: 403 }),
      ...dominoRow(420, 293, 9, 32),
      part('ball', 738, 279, 0, { size: 14 }),
      part('plank', 870, 420, 18, { length: 260 }),
      part('plank', 1165, 470, 90, { length: 460 }),
      part('bucket', 1086, 650, 0, { width: 150 }),
    ],
  },
  {
    version: 1,
    name: 'Seesaw Catapult',
    description: 'A bowling ball rolls off a ledge and slams onto a seesaw, catapulting a crate up into the bucket.',
    parts: [
      part('plank', 740, 250, -8, { length: 140 }),
      part('bowlingBall', 785, 205),
      part('seesaw', 500, 642, -19, { length: 320, pivot: 0.15 }),
      part('crate', 385, 655, -19, { size: 30 }),
      part('bucket', 565, 420, 0, { width: 100 }),
    ],
  },
  {
    version: 1,
    name: 'Chime Cascade',
    description: 'A ball zig-zags down a tower of ramps, ringing a bell at every turn before dropping into the bucket.',
    parts: [
      part('ball', 270, 120, 0, { size: 14 }),
      part('plank', 900, 330, 90, { length: 460 }),
      part('plank', 230, 330, 90, { length: 460 }),
      part('plank', 525, 179, 6, { length: 553 }),
      part('bell', 865, 212),
      part('plank', 611.5, 329.5, -6, { length: 566 }),
      part('bell', 265, 363),
      part('plank', 518.5, 469, 6, { length: 563 }),
      part('bell', 865, 502),
      part('bucket', 856, 650, 0, { width: 170 }),
    ],
  },
  {
    version: 1,
    name: 'Wind Factory',
    description: 'A ball spins a paddle wheel, rides a conveyor belt, catches an updraft and gets blown sideways into the bucket.',
    parts: [
      part('ball', 275, 60, 0, { size: 14 }),
      part('wheel', 250, 250, 0, { size: 70, paddles: 6 }),
      part('conveyor', 400, 540, 0, { length: 500, speed: 3 }),
      part('fan', 720, 680, -90, { reach: 420, strength: 7 }),
      part('fan', 650, 300, 0, { reach: 300, strength: 4 }),
      part('bucket', 960, 560, 0, { width: 140 }),
    ],
  },
];

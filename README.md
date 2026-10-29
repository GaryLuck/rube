# Rube Workshop

A browser app for building and running Rube Goldberg machines. Drop parts onto the board, wire up a chain reaction, press **Run**, and watch the physics play out until something lands in the goal bucket.

Built with TypeScript, [Vite](https://vite.dev) and the [Matter.js](https://brm.io/matter-js/) physics engine.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the test suite (includes simulating every sample) |
| `npm run typecheck` | TypeScript only |
| `npm run samples:check` | Run each sample 30 times with tiny random nudges and report how often it succeeds |

## Using the editor

- **Place**: click a part in the palette, then click the board (or drag the part onto the board). Hold <kbd>Shift</kbd> to place several.
- **Select / move**: click a part, then drag it. Arrow keys nudge it (<kbd>Shift</kbd> for 10px).
- **Rotate**: drag the round handle above the selection, use <kbd>Q</kbd>/<kbd>E</kbd>, or the angle slider.
- **Tune**: the inspector on the right has sliders for each part (length, size, speed, strength…).
- **Run**: <kbd>Space</kbd> runs / resets, <kbd>P</kbd> pauses. While it runs you can drag objects to poke them. Use the speed menu for slow motion.
- **Undo / redo**: <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>. Loading a sample or starting a new machine can be undone too.
- **Keep your work**: the current machine autosaves in the browser. **Save**/**Open** keep named machines in the browser, **Export**/**Import** use `.json` files, and **Share** copies a link with the whole machine encoded in it.

### Parts

| Part | Notes |
| --- | --- |
| Ball, Bowling ball | Rolling movers. Balls can start with a push. |
| Crate, Domino | Tumbling movers. |
| Plank | Fixed ramp, shelf or wall. |
| Trampoline | Springy pad; springiness above 1 adds energy. |
| Seesaw | Pinned plank with an adjustable pivot. |
| Pendulum | Bob on a rope; its angle sets the release point. |
| Paddle wheel | Spins freely on an axle. |
| Conveyor belt | Drives whatever rests on top; negative speed reverses it. |
| Fan | Pushes objects in its airflow in proportion to their size, so light things fly and heavy things don't. |
| Bell | Rings when hit. |
| Goal bucket | Get anything inside to complete the machine. |

## Samples

1. **Domino Rally**: a pendulum topples a row of dominoes; the last one knocks a ball off a shelf, down a ramp and into the bucket.
2. **Seesaw Catapult**: a bowling ball rolls off a ledge onto a seesaw and catapults a crate into a raised bucket.
3. **Chime Cascade**: a ball zig-zags down a tower of ramps, ringing a bell at every turn.
4. **Wind Factory**: a ball spins a paddle wheel, rides a conveyor, catches an updraft from one fan and is blown into the bucket by another.

The simulation runs at a fixed 60 Hz step, so a machine behaves the same way every run. Browsers can still differ in the last digits of their maths, so the tests also check that each sample succeeds when its parts are nudged by fractions of a pixel.

## Project layout

```
src/parts.ts    part catalogue: parameters and how each part becomes Matter.js bodies
src/sim.ts      Simulation: builds a world from a design, steps it, fans/conveyors, goal & bell events
src/render.ts   canvas drawing
src/main.ts     editor UI, run loop, toolbar, inspector
src/samples.ts  the four sample machines
src/storage.ts  autosave, saved machines, share links
src/audio.ts    WebAudio bell / knock / fanfare
tests/          Vitest suite
scripts/        headless tools for tuning machines
```

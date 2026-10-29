import Matter from 'matter-js';
import './style.css';
import { Sound } from './audio.ts';
import {
  PART_DEFS,
  PART_ORDER,
  WORLD_H,
  WORLD_W,
  createPart,
  newId,
  sanitizeDesign,
  type Category,
  type Design,
  type Part,
  type PartType,
} from './parts.ts';
import {
  SELECT_COLOR,
  drawBodies,
  drawScene,
  drawSelection,
  fitView,
  screenToWorld,
  type View,
} from './render.ts';
import { SAMPLES } from './samples.ts';
import { STEP_MS, Simulation } from './sim.ts';
import {
  decodeShare,
  deleteMachine,
  encodeShare,
  listSaved,
  loadCurrent,
  saveCurrent,
  saveMachine,
} from './storage.ts';

const { Composite, Constraint, Vector } = Matter;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d')!;
const stage = $<HTMLDivElement>('stage');
const hud = $<HTMLDivElement>('hud');
const banner = $<HTMLDivElement>('banner');
const statusEl = $<HTMLParagraphElement>('status');
const inspector = $<HTMLElement>('inspector');
const nameInput = $<HTMLInputElement>('machine-name');
const runBtn = $<HTMLButtonElement>('run-btn');
const resetBtn = $<HTMLButtonElement>('reset-btn');
const undoBtn = $<HTMLButtonElement>('undo-btn');
const redoBtn = $<HTMLButtonElement>('redo-btn');
const snapBox = $<HTMLInputElement>('snap');
const speedSel = $<HTMLSelectElement>('speed');
const samplesSel = $<HTMLSelectElement>('samples');
const muteBtn = $<HTMLButtonElement>('mute-btn');
const partCount = $<HTMLSpanElement>('part-count');
const fileInput = $<HTMLInputElement>('file-input');
const dialog = $<HTMLDialogElement>('machines-dialog');
const toastEl = $<HTMLDivElement>('toast');

const sound = new Sound();

// ---------------------------------------------------------------------------
// State

let design: Design = initialDesign();
let editSim = new Simulation(design);
let runSim: Simulation | null = null;
let paused = false;
let selectedId: string | null = null;
let hoverId: string | null = null;
let tool: PartType | null = null;
let pointer: Matter.Vector | null = null;
let view: View = fitView(1, 1, 1);
let accumulator = 0;
let lastFrame = performance.now();
let committed = JSON.stringify(design);
const undoStack: string[] = [];
const redoStack: string[] = [];

type Drag =
  | { kind: 'move'; id: string; start: Matter.Vector; from: { x: number; y: number }; moved: boolean }
  | { kind: 'rotate'; id: string; moved: boolean }
  | { kind: 'grab'; constraint: Matter.Constraint };
let drag: Drag | null = null;
let rotateHandle: Matter.Vector | null = null;

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}
let confetti: Confetto[] = [];

function initialDesign(): Design {
  const hash = new URLSearchParams(location.hash.slice(1)).get('m');
  if (hash) {
    try {
      const d = decodeShare(hash);
      history.replaceState(null, '', location.pathname + location.search);
      return d;
    } catch {
      // Fall through to the autosave.
    }
  }
  return loadCurrent() ?? cloneDesign(SAMPLES[0]);
}

function cloneDesign(d: Design): Design {
  return sanitizeDesign(JSON.parse(JSON.stringify(d)));
}

const running = () => runSim !== null;
const selectedPart = () => design.parts.find((p) => p.id === selectedId) ?? null;

// ---------------------------------------------------------------------------
// Editing & history

function rebuild() {
  editSim = new Simulation(design);
}

/** Records the current design as an undoable step (if it changed) and autosaves it. */
function commit() {
  const snap = JSON.stringify(design);
  if (snap === committed) return;
  undoStack.push(committed);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  committed = snap;
  saveCurrent(design);
  refreshChrome();
}

function restore(snapshot: string) {
  design = sanitizeDesign(JSON.parse(snapshot));
  committed = snapshot;
  if (selectedId && !design.parts.some((p) => p.id === selectedId)) selectedId = null;
  saveCurrent(design);
  rebuild();
  renderInspector();
  refreshChrome();
}

function undo() {
  if (running() || !undoStack.length) return;
  redoStack.push(committed);
  restore(undoStack.pop()!);
}

function redo() {
  if (running() || !redoStack.length) return;
  undoStack.push(committed);
  restore(redoStack.pop()!);
}

/** Replaces the whole machine as one undoable step. */
function loadDesign(d: Design, message?: string) {
  stopRun();
  design = cloneDesign(d);
  selectedId = null;
  setTool(null);
  rebuild();
  commit();
  renderInspector();
  refreshChrome();
  if (message) toast(message);
}

function updatePart(id: string, change: Partial<Part>, live = true) {
  const part = design.parts.find((p) => p.id === id);
  if (!part) return;
  Object.assign(part, change);
  part.x = clamp(part.x, -50, WORLD_W + 50);
  part.y = clamp(part.y, -200, WORLD_H + 20);
  rebuild();
  if (!live) commit();
}

function addPart(type: PartType, at: Matter.Vector) {
  const p = createPart(type, snapValue(at.x), snapValue(at.y));
  design.parts.push(p);
  selectedId = p.id;
  rebuild();
  commit();
  renderInspector();
}

function deleteSelected() {
  if (!selectedId || running()) return;
  design.parts = design.parts.filter((p) => p.id !== selectedId);
  selectedId = null;
  rebuild();
  commit();
  renderInspector();
}

function duplicateSelected() {
  const part = selectedPart();
  if (!part || running()) return;
  const copy: Part = { ...structuredClone(part), id: newId(), x: part.x + 30, y: part.y - 30 };
  design.parts.push(copy);
  selectedId = copy.id;
  rebuild();
  commit();
  renderInspector();
}

function snapValue(v: number, step = 5) {
  return snapBox.checked ? Math.round(v / step) * step : Math.round(v * 10) / 10;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function normAngle(a: number) {
  let x = ((a + 180) % 360) - 180;
  if (x < -180) x += 360;
  return Math.round(x * 10) / 10;
}

function setTool(t: PartType | null) {
  tool = t;
  document.querySelectorAll<HTMLButtonElement>('.part-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === t);
    b.setAttribute('aria-pressed', String(b.dataset.type === t));
  });
  stage.classList.toggle('placing', !!t);
  refreshChrome();
}

// ---------------------------------------------------------------------------
// Running

function startRun() {
  sound.unlock();
  if (running()) {
    setPaused(!paused);
    return;
  }
  setTool(null);
  drag = null;
  confetti = [];
  banner.hidden = true;
  runSim = new Simulation(cloneDesign(design), {
    goal: (id, t) => onGoal(id, t),
    bell: (id) => {
      const idx = design.parts.filter((p) => p.type === 'bell').findIndex((p) => p.id === id);
      sound.bell([1, 1.26, 1.5, 2][Math.max(0, idx) % 4]);
    },
    impact: (speed) => sound.impact(speed),
  });
  paused = false;
  accumulator = 0;
  refreshChrome();
}

function stopRun() {
  runSim = null;
  paused = false;
  drag = null;
  banner.hidden = true;
  confetti = [];
  refreshChrome();
}

function setPaused(p: boolean) {
  if (!running()) return;
  paused = p;
  refreshChrome();
}

function onGoal(partId: string, t: number) {
  sound.success();
  banner.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = 'Machine complete!';
  const span = document.createElement('span');
  span.textContent = `Reached the goal in ${(t / 1000).toFixed(2)} s`;
  banner.append(strong, span);
  banner.hidden = false;
  const bucket = design.parts.find((p) => p.id === partId);
  const colors = ['#e4572e', '#2ec478', '#3a6df0', '#f4c430', '#ef476f', '#2a9d8f'];
  for (let i = 0; i < 120; i++) {
    confetti.push({
      x: bucket?.x ?? WORLD_W / 2,
      y: (bucket?.y ?? WORLD_H / 2) - 30,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 3,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length],
      life: 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Drawing

function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  view = fitView(rect.width, rect.height, dpr);
}

function frame(now: number) {
  const dt = Math.min(100, now - lastFrame);
  lastFrame = now;
  if (runSim && !paused) {
    accumulator += dt * Number(speedSel.value);
    let steps = 0;
    while (accumulator >= STEP_MS && steps < 12) {
      runSim.step();
      accumulator -= STEP_MS;
      steps++;
    }
    if (steps === 12) accumulator = 0;
  }
  updateConfetti(dt / 16.67);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

function draw(clock: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#e8dfcd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    view.dpr * view.scale,
    0,
    0,
    view.dpr * view.scale,
    view.dpr * view.offsetX,
    view.dpr * view.offsetY,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, WORLD_H);
  ctx.clip();

  const sim = runSim ?? editSim;
  const grab =
    drag?.kind === 'grab' && runSim
      ? { from: Constraint.pointBWorld(drag.constraint), to: drag.constraint.pointA }
      : null;
  drawScene(ctx, sim, {
    mode: runSim ? 'run' : 'edit',
    clock: runSim ? runSim.time / 1000 : clock,
    selectedId,
    hoverId,
    grab,
  });

  rotateHandle = null;
  if (!runSim) {
    if (hoverId && hoverId !== selectedId && !tool) {
      const b = editSim.partBounds(hoverId);
      if (b) drawSelection(ctx, b, false, 'rgba(58,109,240,0.45)', view.scale);
    }
    const sel = selectedPart();
    if (sel) {
      const b = editSim.partBounds(sel.id);
      if (b) rotateHandle = drawSelection(ctx, b, PART_DEFS[sel.type].rotatable, SELECT_COLOR, view.scale).handle;
    }
    if (tool && pointer) drawGhost(tool, pointer, clock);
  }
  drawConfetti();
  ctx.restore();

  if (runSim) {
    const rung = runSim.bellRings.size;
    const bells = design.parts.filter((p) => p.type === 'bell').length;
    const state = runSim.goalReachedAt !== null ? 'Goal reached' : paused ? 'Paused' : 'Running';
    hud.textContent = `${state} · ${(runSim.time / 1000).toFixed(1)} s${bells ? ` · bells ${rung}/${bells}` : ''}`;
  }
}

function drawGhost(type: PartType, at: Matter.Vector, clock: number) {
  const p = createPart(type, snapValue(at.x), snapValue(at.y));
  const built = PART_DEFS[type].build(p);
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawBodies(ctx, built.bodies, built.constraints, new Map([[p.id, p]]), {
    mode: 'edit',
    clock,
    selectedId: null,
    hoverId: null,
  });
  ctx.restore();
}

function updateConfetti(k: number) {
  if (!confetti.length) return;
  for (const c of confetti) {
    c.vy += 0.25 * k;
    c.vx *= 0.99;
    c.x += c.vx * k;
    c.y += c.vy * k;
    c.rot += c.vr * k;
    c.life -= 0.006 * k;
  }
  confetti = confetti.filter((c) => c.life > 0 && c.y < WORLD_H + 20);
}

function drawConfetti() {
  for (const c of confetti) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.life * 2);
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-4, -2.5, 8, 5);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Pointer input

function eventWorld(e: PointerEvent | DragEvent): Matter.Vector {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(view, e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  const w = eventWorld(e);
  canvas.setPointerCapture(e.pointerId);

  if (runSim) {
    const body = runSim.dynamicBodyAt(w);
    if (!body) return;
    const constraint = Constraint.create({
      pointA: { ...w },
      bodyB: body,
      pointB: Vector.sub(w, body.position),
      stiffness: 0.06,
      damping: 0.1,
      length: 0,
    });
    Composite.add(runSim.engine.world, constraint);
    drag = { kind: 'grab', constraint };
    stage.style.cursor = 'grabbing';
    return;
  }

  if (tool) {
    addPart(tool, w);
    if (!e.shiftKey) setTool(null);
    return;
  }

  if (rotateHandle && selectedId) {
    const r = 12 / view.scale;
    if (Vector.magnitude(Vector.sub(w, rotateHandle)) <= r) {
      drag = { kind: 'rotate', id: selectedId, moved: false };
      return;
    }
  }

  const hit = editSim.partAt(w);
  if (hit !== selectedId) {
    selectedId = hit;
    renderInspector();
  }
  if (hit) {
    const p = selectedPart()!;
    drag = { kind: 'move', id: hit, start: w, from: { x: p.x, y: p.y }, moved: false };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const w = eventWorld(e);
  pointer = w;
  if (!drag) {
    if (!runSim && !tool) {
      const h = editSim.partAt(w);
      if (h !== hoverId) hoverId = h;
      const onHandle = rotateHandle && Vector.magnitude(Vector.sub(w, rotateHandle)) <= 12 / view.scale;
      canvas.style.cursor = onHandle ? 'alias' : h ? 'move' : '';
    }
    return;
  }
  if (drag.kind === 'grab') {
    drag.constraint.pointA = { ...w };
    return;
  }
  const d = drag;
  const part = design.parts.find((p) => p.id === d.id);
  if (!part) return;
  if (d.kind === 'move') {
    const nx = snapValue(d.from.x + w.x - d.start.x);
    const ny = snapValue(d.from.y + w.y - d.start.y);
    if (nx !== part.x || ny !== part.y) {
      d.moved = true;
      updatePart(part.id, { x: nx, y: ny });
      syncInspectorValues();
    }
  } else {
    let a = (Math.atan2(w.y - part.y, w.x - part.x) * 180) / Math.PI + 90;
    a = e.shiftKey || !snapBox.checked ? Math.round(a) : Math.round(a / 5) * 5;
    d.moved = true;
    updatePart(part.id, { angle: normAngle(a) });
    syncInspectorValues();
  }
});

function endDrag() {
  if (!drag) return;
  if (drag.kind === 'grab') {
    if (runSim) Composite.remove(runSim.engine.world, drag.constraint);
    stage.style.cursor = '';
  } else if (drag.moved) {
    commit();
  }
  drag = null;
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  pointer = null;
  hoverId = null;
});

// Drag & drop from the palette.
canvas.addEventListener('dragover', (e) => {
  if (running()) return;
  e.preventDefault();
  pointer = eventWorld(e);
});
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer?.getData('text/rube-part') as PartType | undefined;
  if (!type || !(type in PART_DEFS) || running()) return;
  addPart(type, eventWorld(e));
  setTool(null);
});

// ---------------------------------------------------------------------------
// Keyboard

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, dialog')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
    return;
  }
  if (mod) return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      if (running()) stopRun();
      else startRun();
      return;
    case 'p':
    case 'P':
      setPaused(!paused);
      return;
    case 'Escape':
      if (running()) stopRun();
      else if (tool) setTool(null);
      else {
        selectedId = null;
        renderInspector();
      }
      return;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      deleteSelected();
      return;
  }
  const part = selectedPart();
  if (!part || running()) return;
  const step = e.shiftKey ? 10 : 1;
  const rotStep = e.shiftKey ? 1 : 15;
  const moves: Record<string, Partial<Part>> = {
    ArrowLeft: { x: part.x - step },
    ArrowRight: { x: part.x + step },
    ArrowUp: { y: part.y - step },
    ArrowDown: { y: part.y + step },
  };
  if (e.key in moves) {
    e.preventDefault();
    updatePart(part.id, moves[e.key], false);
    syncInspectorValues();
  } else if ((e.key === 'q' || e.key === 'Q' || e.key === '[') && PART_DEFS[part.type].rotatable) {
    updatePart(part.id, { angle: normAngle(part.angle - rotStep) }, false);
    syncInspectorValues();
  } else if ((e.key === 'e' || e.key === 'E' || e.key === ']') && PART_DEFS[part.type].rotatable) {
    updatePart(part.id, { angle: normAngle(part.angle + rotStep) }, false);
    syncInspectorValues();
  }
});

// ---------------------------------------------------------------------------
// Palette

function buildPalette() {
  const root = $<HTMLDivElement>('palette');
  const categories: Category[] = ['Movers', 'Structure', 'Gadgets', 'Goal'];
  for (const cat of categories) {
    const group = document.createElement('div');
    group.className = 'palette-group';
    const h = document.createElement('h3');
    h.textContent = cat;
    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    for (const type of PART_ORDER.filter((t) => PART_DEFS[t].category === cat)) {
      const def = PART_DEFS[type];
      const btn = document.createElement('button');
      btn.className = 'part-btn';
      btn.dataset.type = type;
      btn.title = `${def.label}: ${def.description}`;
      btn.draggable = true;
      btn.setAttribute('aria-pressed', 'false');
      const icon = document.createElement('canvas');
      drawIcon(icon, type);
      const label = document.createElement('span');
      label.textContent = def.label;
      btn.append(icon, label);
      btn.addEventListener('click', () => {
        if (running()) stopRun();
        setTool(tool === type ? null : type);
      });
      btn.addEventListener('dragstart', (e) => {
        if (running()) stopRun();
        e.dataTransfer?.setData('text/rube-part', type);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
      });
      grid.append(btn);
    }
    group.append(h, grid);
    root.append(group);
  }
}

function drawIcon(c: HTMLCanvasElement, type: PartType) {
  const dpr = window.devicePixelRatio || 1;
  const W = 64;
  const H = 40;
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext('2d')!;
  const part = createPart(type, 0, 0);
  if (type === 'fan') part.params.reach = 90;
  if (type === 'plank' || type === 'conveyor' || type === 'bouncer') part.params.length = 160;
  const built = PART_DEFS[type].build(part);
  const b = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
  for (const body of built.bodies) {
    b.min.x = Math.min(b.min.x, body.bounds.min.x);
    b.min.y = Math.min(b.min.y, body.bounds.min.y);
    b.max.x = Math.max(b.max.x, body.bounds.max.x);
    b.max.y = Math.max(b.max.y, body.bounds.max.y);
  }
  if (type === 'pendulum') b.min.y = Math.min(b.min.y, -6);
  if (type === 'bell') {
    b.min.y -= 22;
    b.max.y += 20;
  }
  const s = Math.min((W - 6) / (b.max.x - b.min.x), (H - 6) / (b.max.y - b.min.y), 1.2);
  g.setTransform(
    dpr * s,
    0,
    0,
    dpr * s,
    dpr * (W / 2 - ((b.min.x + b.max.x) / 2) * s),
    dpr * (H / 2 - ((b.min.y + b.max.y) / 2) * s),
  );
  drawBodies(g, built.bodies, built.constraints, new Map([[part.id, part]]), {
    mode: 'edit',
    clock: 0.15,
    selectedId: null,
    hoverId: null,
  });
}

// ---------------------------------------------------------------------------
// Inspector

function renderInspector() {
  inspector.innerHTML = '';
  const part = selectedPart();
  if (!part) {
    renderMachineInfo();
    return;
  }
  const def = PART_DEFS[part.type];
  const h = document.createElement('h3');
  h.textContent = 'Selected part';
  const title = document.createElement('p');
  title.className = 'title';
  title.textContent = def.label;
  const desc = document.createElement('p');
  desc.textContent = def.description;
  inspector.append(h, title, desc);

  if (def.rotatable) {
    inspector.append(
      slider('angle', 'Angle', -180, 180, 1, part.angle, '°', (v, live) =>
        updatePart(part.id, { angle: v }, live),
      ),
    );
  }
  for (const pd of def.params) {
    inspector.append(
      slider(`param-${pd.key}`, pd.label, pd.min, pd.max, pd.step, part.params[pd.key] ?? pd.default, pd.unit ?? '', (v, live) => {
        part.params[pd.key] = v;
        updatePart(part.id, {}, live);
      }),
    );
  }

  const xy = document.createElement('div');
  xy.className = 'xy';
  for (const axis of ['x', 'y'] as const) {
    const label = document.createElement('label');
    label.textContent = axis.toUpperCase();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.dataset.field = axis;
    input.value = String(part[axis]);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) updatePart(part.id, { [axis]: v }, false);
      syncInspectorValues();
    });
    label.append(input);
    xy.append(label);
  }
  inspector.append(xy);

  const row = document.createElement('div');
  row.className = 'row';
  const dup = document.createElement('button');
  dup.textContent = 'Duplicate';
  dup.title = 'Duplicate (Ctrl+D)';
  dup.addEventListener('click', duplicateSelected);
  const del = document.createElement('button');
  del.textContent = 'Delete';
  del.className = 'danger';
  del.title = 'Delete (Del)';
  del.addEventListener('click', deleteSelected);
  row.append(dup, del);
  inspector.append(row);
}

function slider(
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string,
  onChange: (v: number, live: boolean) => void,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const text = document.createElement('span');
  text.textContent = label;
  const out = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.dataset.field = key;
  const fmt = (v: number) => `${Number.isInteger(step) ? v.toFixed(0) : v.toFixed(2)}${unit}`;
  out.textContent = fmt(value);
  input.addEventListener('input', () => {
    out.textContent = fmt(Number(input.value));
    onChange(Number(input.value), true);
  });
  input.addEventListener('change', () => onChange(Number(input.value), false));
  wrap.append(text, out, input);
  return wrap;
}

/** Updates inspector inputs in place after a drag or keyboard nudge. */
function syncInspectorValues() {
  const part = selectedPart();
  if (!part) return;
  const set = (field: string, v: number, suffix = '') => {
    const input = inspector.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
    if (!input) return;
    input.value = String(v);
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = `${Math.round(v)}${suffix}`;
  };
  set('angle', part.angle, '°');
  for (const axis of ['x', 'y'] as const) {
    const input = inspector.querySelector<HTMLInputElement>(`input[data-field="${axis}"]`);
    if (input) input.value = String(part[axis]);
  }
}

function renderMachineInfo() {
  const h = document.createElement('h3');
  h.textContent = 'Machine';
  const descLabel = document.createElement('label');
  descLabel.className = 'sr-only';
  descLabel.htmlFor = 'machine-desc';
  descLabel.textContent = 'Description';
  const desc = document.createElement('textarea');
  desc.id = 'machine-desc';
  desc.placeholder = 'Describe what your machine does…';
  desc.value = design.description ?? '';
  desc.addEventListener('input', () => {
    design.description = desc.value;
  });
  desc.addEventListener('change', commit);

  const how = document.createElement('h3');
  how.textContent = 'How to build';
  how.style.marginTop = '16px';
  const steps = document.createElement('p');
  steps.innerHTML =
    'Pick a part from the palette, then click the board to place it (or drag it in). Click a part to select it, drag to move it, and drag the round handle to rotate it. Get something into the <b>Goal bucket</b> to win.';

  const keys = document.createElement('h3');
  keys.textContent = 'Shortcuts';
  keys.style.marginTop = '16px';
  const list = document.createElement('ul');
  list.className = 'shortcuts';
  list.innerHTML = [
    '<kbd>Space</kbd> run / reset',
    '<kbd>P</kbd> pause',
    '<kbd>Q</kbd> <kbd>E</kbd> rotate 15°',
    '<kbd>←↑→↓</kbd> nudge (Shift: 10px)',
    '<kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate',
    '<kbd>Ctrl</kbd>+<kbd>Z</kbd> undo',
    'Shift-click to place several',
    'While running, drag things to poke them',
  ]
    .map((s) => `<li>${s}</li>`)
    .join('');
  inspector.append(h, descLabel, desc, how, steps, keys, list);
}

// ---------------------------------------------------------------------------
// Chrome (toolbar state, status line)

function refreshChrome() {
  const isRunning = running();
  runBtn.textContent = isRunning ? (paused ? '▶ Resume' : '❚❚ Pause') : '▶ Run';
  runBtn.title = isRunning ? 'Pause / resume (P)' : 'Run the machine (Space)';
  resetBtn.disabled = !isRunning;
  undoBtn.disabled = isRunning || !undoStack.length;
  redoBtn.disabled = isRunning || !redoStack.length;
  stage.classList.toggle('running', isRunning);
  hud.hidden = !isRunning;
  inspector.toggleAttribute('inert', isRunning);
  inspector.style.opacity = isRunning ? '0.55' : '';
  if (document.activeElement !== nameInput) nameInput.value = design.name;
  const n = design.parts.length;
  partCount.textContent = `${n} part${n === 1 ? '' : 's'}`;
  const hasGoal = design.parts.some((p) => p.type === 'bucket');
  if (isRunning) {
    statusEl.textContent = 'Running. Drag objects to give them a nudge, or press Esc to go back to editing.';
  } else if (tool) {
    statusEl.textContent = `Click to place a ${PART_DEFS[tool].label.toLowerCase()}. Hold Shift to place several, Esc to cancel.`;
  } else if (!n) {
    statusEl.textContent = 'Empty board: pick a part from the palette, or load a sample from the menu above.';
  } else if (!hasGoal) {
    statusEl.textContent = 'Tip: add a Goal bucket so the machine has something to aim for.';
  } else {
    statusEl.textContent = 'Press Run (or Space) to set your machine in motion.';
  }
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(Number(toastEl.dataset.timer));
  toastEl.dataset.timer = String(window.setTimeout(() => toastEl.classList.remove('show'), 2200));
}

// ---------------------------------------------------------------------------
// Toolbar wiring

runBtn.addEventListener('click', startRun);
resetBtn.addEventListener('click', stopRun);
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

nameInput.addEventListener('input', () => {
  design.name = nameInput.value.slice(0, 80) || 'Untitled machine';
});
nameInput.addEventListener('change', commit);

for (const [i, s] of SAMPLES.entries()) {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = s.name;
  samplesSel.append(opt);
}
samplesSel.addEventListener('change', () => {
  const s = SAMPLES[Number(samplesSel.value)];
  samplesSel.value = '';
  if (s) loadDesign(s, `Loaded “${s.name}”. Press Run to watch it go!`);
});

$('new-btn').addEventListener('click', () => {
  loadDesign({ version: 1, name: 'Untitled machine', parts: [] }, 'New machine. Undo brings the old one back.');
});

$('save-btn').addEventListener('click', () => {
  commit();
  toast(saveMachine(design) ? `Saved “${design.name}” in this browser` : 'Could not save: browser storage is unavailable');
});

$('open-btn').addEventListener('click', () => {
  renderMachineList();
  dialog.showModal();
});

function renderMachineList() {
  const list = $<HTMLUListElement>('machines-list');
  list.innerHTML = '';
  const saved = listSaved();
  if (!saved.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing saved yet. Use Save to keep a machine in this browser.';
    list.append(li);
    return;
  }
  for (const m of saved) {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('strong');
    name.textContent = m.name;
    const when = document.createElement('small');
    when.textContent = `${m.design.parts.length} parts · ${new Date(m.savedAt).toLocaleString()}`;
    meta.append(name, when);
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open';
    open.addEventListener('click', () => {
      dialog.close();
      loadDesign(m.design, `Opened “${m.name}”`);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.className = 'danger';
    del.addEventListener('click', () => {
      if (!confirm(`Delete “${m.name}” from this browser?`)) return;
      deleteMachine(m.name);
      renderMachineList();
    });
    li.append(meta, open, del);
    list.append(li);
  }
}

$('export-btn').addEventListener('click', () => {
  commit();
  const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${design.name.replace(/[^\w\- ]+/g, '').trim() || 'machine'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const d = sanitizeDesign(JSON.parse(await file.text()));
    loadDesign(d, `Imported “${d.name}”`);
  } catch (err) {
    toast(`Could not import: ${(err as Error).message}`);
  }
});

$('share-btn').addEventListener('click', async () => {
  commit();
  const url = `${location.origin}${location.pathname}#m=${encodeShare(design)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Share link copied to the clipboard');
  } catch {
    history.replaceState(null, '', url);
    toast('Share link is now in the address bar');
  }
});

muteBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  muteBtn.textContent = sound.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
});

snapBox.addEventListener('change', () => canvas.focus());

// ---------------------------------------------------------------------------
// Boot

buildPalette();
renderInspector();
refreshChrome();
new ResizeObserver(resize).observe(stage);
resize();
requestAnimationFrame(frame);

// Exposed for automated browser checks.
Object.assign(window, {
  __rube: {
    get design() {
      return design;
    },
    get sim() {
      return runSim;
    },
  },
});

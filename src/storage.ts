import { sanitizeDesign, type Design } from './parts.ts';

const CURRENT_KEY = 'rube.current';
const SAVED_KEY = 'rube.saved';

export interface SavedMachine {
  name: string;
  savedAt: number;
  design: Design;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrent(): Design | null {
  const raw = read(CURRENT_KEY);
  if (!raw) return null;
  try {
    return sanitizeDesign(raw);
  } catch {
    return null;
  }
}

export function saveCurrent(design: Design) {
  write(CURRENT_KEY, design);
}

export function listSaved(): SavedMachine[] {
  const raw = read(SAVED_KEY);
  if (!Array.isArray(raw)) return [];
  const out: SavedMachine[] = [];
  for (const item of raw) {
    try {
      out.push({ name: String(item.name), savedAt: Number(item.savedAt) || 0, design: sanitizeDesign(item.design) });
    } catch {
      // Skip corrupt entries.
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Saves under the design's name, replacing an existing machine with the same name. */
export function saveMachine(design: Design): boolean {
  const list = listSaved().filter((m) => m.name !== design.name);
  list.unshift({ name: design.name, savedAt: Date.now(), design });
  return write(SAVED_KEY, list);
}

export function deleteMachine(name: string) {
  write(
    SAVED_KEY,
    listSaved().filter((m) => m.name !== name),
  );
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Compact share format: rounds numbers so links stay short. */
export function encodeShare(design: Design): string {
  const compact = {
    name: design.name,
    parts: design.parts.map((p) => ({
      type: p.type,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      angle: Math.round(p.angle * 10) / 10,
      params: p.params,
    })),
  };
  return toBase64Url(JSON.stringify(compact));
}

export function decodeShare(data: string): Design {
  return sanitizeDesign(JSON.parse(fromBase64Url(data)));
}

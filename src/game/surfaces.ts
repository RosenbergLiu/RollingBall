import { BALL_RADIUS, ENTRANCE_LENGTH, holeDistance, segmentAt, type BuiltLevel, type TrackState } from './level';
import { segmentLength } from './path';
import type { Vec3 } from './physics';

/*
 * Surface tiles (docs/level-design-guide.md §7.3): painted patches on the track with their
 * own behavior and look. They don't change the platform's shape or collision; their effect
 * is applied in code while the ball rolls on them.
 * - boost: orange arrows that push the ball forward along the route;
 * - music: colored tiles that each play a note when the ball rolls onto them.
 */

export type SurfaceType = 'boost' | 'music';

/** A rectangle on the track, in authored path coordinates (like holes and coins). */
export interface Surface {
  type: SurfaceType;
  /** From s0 to s1 along the route (authored s). */
  s0: number;
  s1: number;
  /** Across the track (+ = right). Leave both out to cover the full width. */
  u0?: number;
  u1?: number;
  /** music: the note, in semitones from C5 (use note('E5') for readability). */
  note?: number;
}

export interface BuiltSurface {
  type: SurfaceType;
  /** Absolute s. */
  s0: number;
  s1: number;
  u0?: number;
  u1?: number;
  note: number;
  /** Position in the level's (s0-sorted) surface list. */
  index: number;
}

export const BOOST = {
  /** Forward push while the ball rolls on the arrows (m/s²). The speed cap still applies. */
  accel: 22,
  /** After a boost pad the route stays clear (no holes, wide, no tight curve) this far. */
  clearAfter: 15,
  minWidthAfter: 5,
  minRadiusAfter: 20,
};

export const MUSIC = {
  /** Shortest music tile (m): shorter ones blur into each other. */
  minTile: 1.2,
  /** Note range in semitones from C5: C4 to C7. */
  lowNote: -12,
  highNote: 24,
};

/** Surfaces stay this far inside the platform edges and away from hole rims. */
const MARGIN = 0.2;

/** The ball counts as rolling on a surface while its center is at most this high above it. */
const CONTACT_HEIGHT = BALL_RADIUS + 0.35;

// ---------------------------------------------------------------------- authoring helpers

const NOTE_STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Semitones from C5 for a note name such as 'C5', 'G4', 'F#5' or 'Bb4'. */
export function note(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`Not a note name: ${name}`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return NOTE_STEPS[m[1]] + accidental + (Number(m[3]) - 5) * 12;
}

/** A boost pad: arrows from s to s + length, across [u0, u1] (default: the full width). */
export function boostPad(s: number, length = 4, u0?: number, u1?: number): Surface {
  return { type: 'boost', s0: s, s1: s + length, u0, u1 };
}

/** A row of music tiles from s, each `tileLength` long, playing `notes` (names) in order. */
export function musicTiles(s: number, tileLength: number, notes: string[], u0?: number, u1?: number): Surface[] {
  return notes.map((n, i) => ({
    type: 'music' as const,
    s0: s + i * tileLength,
    s1: s + (i + 1) * tileLength,
    u0,
    u1,
    note: note(n),
  }));
}

// ---------------------------------------------------------------------- rules at play time

/** The lateral range a surface covers at absolute s. */
export function surfaceSpan(level: BuiltLevel, x: BuiltSurface, s: number): [number, number] {
  const half = level.widthAt(s) / 2;
  return [x.u0 ?? -half, x.u1 ?? half];
}

/** The surface under (s, u) (absolute s), if any. */
export function surfaceAt(level: BuiltLevel, s: number, u: number): BuiltSurface | null {
  for (const x of level.surfaces) {
    if (x.s0 > s) break; // sorted by s0
    if (s >= x.s1) continue;
    const [u0, u1] = surfaceSpan(level, x, s);
    if (u >= u0 && u <= u1) return x;
  }
  return null;
}

/**
 * Remembers which surface the ball is on, so a tile triggers once when the ball rolls onto
 * it (a music note, a boost whoosh) and again only after it has left it.
 */
export class SurfaceContact {
  current: BuiltSurface | null = null;

  reset(): void {
    this.current = null;
  }

  /** Updates from the tracked ball; returns the surface it just rolled onto, if any. */
  update(level: BuiltLevel, t: TrackState): BuiltSurface | null {
    const on = t.height < CONTACT_HEIGHT && t.height > -0.5 ? surfaceAt(level, t.s, t.u) : null;
    const entered = on && on !== this.current ? on : null;
    this.current = on;
    return entered;
  }
}

/**
 * Applies surface effects for one physics step: adds the boost push to `accel` while the
 * ball is on boost arrows. Returns the surface the ball just rolled onto (for sound and
 * light), or null.
 */
export function applySurfaces(level: BuiltLevel, t: TrackState, contact: SurfaceContact, accel: Vec3): BuiltSurface | null {
  if (level.surfaces.length === 0) return null;
  const entered = contact.update(level, t);
  if (contact.current?.type === 'boost') {
    const { samples, ds } = level.path;
    const tan = samples[Math.min(samples.length - 1, Math.max(0, Math.round(t.s / ds)))].tan;
    const h = Math.hypot(tan.x, tan.z) || 1;
    accel.x += (tan.x / h) * BOOST.accel;
    accel.z += (tan.z / h) * BOOST.accel;
  }
  return entered;
}

// ---------------------------------------------------------------------- design rules

/** Every surface rule a level breaks (empty when valid). */
export function surfaceProblems(level: BuiltLevel): string[] {
  const def = level.def;
  const problems: string[] = [];
  const authored = def.segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
  const xs = level.surfaces;
  const name = (x: BuiltSurface) =>
    `${x.type} tile at s ${(x.s0 - ENTRANCE_LENGTH).toFixed(1)}–${(x.s1 - ENTRANCE_LENGTH).toFixed(1)}`;
  xs.forEach((x, i) => {
    const a0 = x.s0 - ENTRANCE_LENGTH;
    const a1 = x.s1 - ENTRANCE_LENGTH;
    const where = name(x);
    if (!(x.s1 > x.s0)) problems.push(`${where} has no length`);
    if (a0 < 0 || a1 > authored) problems.push(`${where} is outside the authored route`);
    if (x.u0 !== undefined && x.u1 !== undefined && !(x.u1 > x.u0)) problems.push(`${where} has no width`);
    for (let s = x.s0; s <= x.s1 + 1e-9; s += 0.5) {
      const half = level.widthAt(s) / 2 - MARGIN;
      const [u0, u1] = surfaceSpan(level, x, s);
      if ((x.u0 !== undefined && u0 < -half) || (x.u1 !== undefined && u1 > half)) {
        problems.push(`${where} sticks out over the edge at s ${(s - ENTRANCE_LENGTH).toFixed(1)}`);
        break;
      }
    }
    for (const h of level.holes) {
      // Closest point of the rectangle to the hole center (in path coordinates).
      const s = Math.min(Math.max(h.s, x.s0), x.s1);
      const [u0, u1] = surfaceSpan(level, x, s);
      const u = Math.min(Math.max(h.u, u0), u1);
      if (holeDistance(h, s, u) < h.r + MARGIN) problems.push(`${where} overlaps the hole at s ${(h.s - ENTRANCE_LENGTH).toFixed(1)}`);
    }
    for (let j = 0; j < i; j++) {
      const y = xs[j];
      if (y.s1 <= x.s0 + 1e-9 || x.s1 <= y.s0 + 1e-9) continue;
      const s = (Math.max(x.s0, y.s0) + Math.min(x.s1, y.s1)) / 2;
      const [xu0, xu1] = surfaceSpan(level, x, s);
      const [yu0, yu1] = surfaceSpan(level, y, s);
      if (xu0 < yu1 - 1e-9 && yu0 < xu1 - 1e-9) problems.push(`${where} overlaps the ${name(y)}`);
    }
    if (x.type === 'music') {
      if (x.s1 - x.s0 < MUSIC.minTile - 1e-9) problems.push(`${where} is shorter than ${MUSIC.minTile} m`);
      if (!Number.isInteger(x.note) || x.note < MUSIC.lowNote || x.note > MUSIC.highNote) problems.push(`${where} has note ${x.note} out of range`);
    }
    if (x.type === 'boost') {
      // On a straight, and a calm, clear route after it: speed must never meet a hazard.
      for (let s = a0; s <= a1 + 1e-9; s += 0.5) {
        const at = segmentAt(def, s);
        if (at && at.seg.kind !== 'straight') {
          problems.push(`${where} is not on a straight`);
          break;
        }
      }
      const end = Math.min(a1 + BOOST.clearAfter, authored);
      for (let s = a1; s <= end + 1e-9; s += 0.5) {
        const at = segmentAt(def, s);
        if (at && at.seg.kind === 'arc' && at.seg.radius < BOOST.minRadiusAfter) {
          problems.push(`${where} leads into a curve tighter than ${BOOST.minRadiusAfter} m`);
          break;
        }
        if (level.widthAt(s + ENTRANCE_LENGTH) < BOOST.minWidthAfter) {
          problems.push(`${where} leads into a section narrower than ${BOOST.minWidthAfter} m`);
          break;
        }
      }
      for (const h of def.holes ?? []) {
        if (h.s + h.r > a0 && h.s - h.r < end) problems.push(`${where} leads into the hole at s ${h.s}`);
      }
    }
  });
  return problems;
}

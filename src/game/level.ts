import { Vector3 } from 'three';
import type { CoinSpot } from './coins';
import type { BuiltSurface, Surface } from './surfaces';
import { buildPath, pathAt, segmentLength, straight, type PathData, type Segment } from './path';

export interface Hole {
  /** Distance along the path in meters (from the start of the authored segments). */
  s: number;
  /** Lateral offset from the centerline in meters (+ = right). */
  u: number;
  /** Radius in meters. */
  r: number;
}

export interface Theme {
  tileA: string;
  tileB: string;
  side: string;
  rim: string;
  skyTop: string;
  horizon: string;
}

export interface LevelDef {
  id: number;
  name: string;
  tagline: string;
  /** Default slope: drop per horizontal meter (0 = flat, negative = uphill). */
  grade: number;
  segments: Segment[];
  /** [s, width] keyframes, s measured from the start of the authored segments. */
  width: [number, number][];
  holes?: Hole[];
  /**
   * Designated coin spots (s from the start of the authored segments). Coins only ever
   * appear on these; each play rolls which spots get a coin and in which color.
   */
  coins?: CoinSpot[];
  /**
   * Checkpoint gates (s from the start of the authored segments), in order. Only for long
   * "adventure" levels; see checkpointProblems() and docs/level-design-guide.md §7.10.
   */
  checkpoints?: number[];
  /** Special surface tiles: boost arrows, music tiles (see src/game/surfaces.ts, guide §7.3). */
  surfaces?: Surface[];
  theme: Theme;
}

/** Flat pad the ball spawns on. */
export const ENTRANCE_LENGTH = 7;
/** Flat area after the finish line where the ball brakes. */
export const RUNOUT_LENGTH = 12;
export const SPAWN_S = 3;
export const BALL_RADIUS = 0.5;
/** Steepest allowed slope, up or down (drop or rise per horizontal meter). */
export const MAX_GRADE = 0.2;
/** Largest slope change between neighbouring segments; keeps crests and dips smooth. */
export const MAX_GRADE_CHANGE = 0.2;
/**
 * The route may not climb in its first meters: a ball that fails to make it up would roll
 * back across the start pad and off its open back edge.
 */
export const NO_CLIMB_START = 12;

/**
 * Every slope rule a level breaks (empty when valid). Routes may go down, run flat or
 * climb, as long as no slope is too steep and slope changes are smooth.
 */
export function slopeProblems(def: LevelDef): string[] {
  const problems: string[] = [];
  const near = (a: number, b: number) => a <= b + 1e-9;
  let s = 0;
  let prev = 0; // the entrance pad is flat
  def.segments.forEach((seg, i) => {
    const g = seg.grade ?? def.grade;
    const where = `segment ${i} (s ${s.toFixed(1)}, grade ${g})`;
    if (!near(Math.abs(g), MAX_GRADE)) problems.push(`${where} is steeper than ${MAX_GRADE}`);
    if (!near(Math.abs(g - prev), MAX_GRADE_CHANGE)) problems.push(`${where} changes slope too sharply from ${prev}`);
    if (g < 0 && s < NO_CLIMB_START) problems.push(`${where} climbs within the first ${NO_CLIMB_START} m`);
    prev = g;
    s += segmentLength(seg);
  });
  if (!near(Math.abs(prev), MAX_GRADE_CHANGE)) problems.push(`the last segment changes slope too sharply into the flat run-out`);
  return problems;
}

/** How far below the surface the ball must drop before it counts as fallen. */
export const FALL_DEPTH = 2.2;

export interface BuiltHole extends Hole {
  /** Arc-length scale at the hole's lateral offset (keeps holes round on curves). */
  m: number;
}

export interface BuiltLevel {
  def: LevelDef;
  path: PathData;
  /** Holes with absolute s. */
  holes: BuiltHole[];
  /** Coin spots with absolute s. */
  coinSpots: CoinSpot[];
  /** Checkpoint gates with absolute s, in order. */
  checkpoints: number[];
  /** Surface tiles with absolute s, sorted by s0. */
  surfaces: BuiltSurface[];
  spawnS: number;
  finishS: number;
  maxWidth: number;
  minY: number;
  widthAt(s: number): number;
}

export function holeDistance(h: BuiltHole, s: number, u: number): number {
  return Math.hypot((s - h.s) * h.m, u - h.u);
}

export function buildLevel(def: LevelDef): BuiltLevel {
  const path = buildPath([straight(ENTRANCE_LENGTH, 0), ...def.segments, straight(RUNOUT_LENGTH, 0)], def.grade);
  const keys = [...def.width]
    .sort((a, b) => a[0] - b[0])
    .map(([s, w]) => [s + ENTRANCE_LENGTH, w] as [number, number]);
  const widthAt = (s: number): number => {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (s <= keys[i][0]) {
        const [s0, w0] = keys[i - 1];
        const [s1, w1] = keys[i];
        const f = (s - s0) / (s1 - s0);
        const e = f * f * (3 - 2 * f);
        return w0 + (w1 - w0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };
  let maxWidth = 0;
  let minY = Infinity;
  path.samples.forEach((smp, i) => {
    maxWidth = Math.max(maxWidth, widthAt(i * path.ds));
    minY = Math.min(minY, smp.pos.y);
  });
  const holes: BuiltHole[] = (def.holes ?? []).map((h) => {
    const s = h.s + ENTRANCE_LENGTH;
    const k = pathAt(path, s).curvature;
    const m = Math.min(2.5, Math.max(0.4, 1 + k * h.u));
    return { s, u: h.u, r: h.r, m };
  });
  return {
    def,
    path,
    holes,
    coinSpots: (def.coins ?? []).map((c) => ({ s: c.s + ENTRANCE_LENGTH, u: c.u })),
    checkpoints: (def.checkpoints ?? []).map((s) => s + ENTRANCE_LENGTH),
    surfaces: (def.surfaces ?? [])
      .map((x) => ({ type: x.type, s0: x.s0 + ENTRANCE_LENGTH, s1: x.s1 + ENTRANCE_LENGTH, u0: x.u0, u1: x.u1, note: x.note ?? 0, index: 0 }))
      .sort((a, b) => a.s0 - b.s0)
      .map((x, index) => ({ ...x, index })),
    spawnS: SPAWN_S,
    finishS: path.length - RUNOUT_LENGTH + 1.5,
    maxWidth,
    minY,
    widthAt,
  };
}

/** Where the ball is placed at rest: on the centerline at `s` (default: the entrance). */
export function spawnPoint(level: BuiltLevel, s = level.spawnS): Vector3 {
  const f = pathAt(level.path, s);
  return f.pos.addScaledVector(f.normal, BALL_RADIUS + 0.01);
}

/** Placement rules for checkpoint gates (also documented in docs/level-design-guide.md §7.10). */
export const CHECKPOINT_RULES = {
  /** At most this many gates per level… */
  max: 3,
  /** …at least this far apart, and this far from the start of the route. */
  minGap: 25,
  /** The last gate is at least this far before the finish line, so it's worth having. */
  minToFinish: 20,
  /** The gate sits on a rest area: straight, gentle and wide from this far before it… */
  restBefore: 6,
  /** …to this far after it (straight and gentle up to restBefore after it). */
  restAfter: 8,
  minWidth: 6,
  /** Downhill at most this steep, and never uphill (a ball respawned at rest would roll back). */
  maxGrade: 0.06,
};

/** The authored segment at authored distance `s`, with its grade. */
export function segmentAt(def: LevelDef, s: number): { seg: Segment; grade: number } | null {
  let start = 0;
  for (const seg of def.segments) {
    const end = start + segmentLength(seg);
    if (s >= start && s <= end) return { seg, grade: seg.grade ?? def.grade };
    start = end;
  }
  return null;
}

/**
 * Every checkpoint rule a level breaks (empty when valid). A respawned ball must start
 * somewhere calm, never facing a hazard: on a straight, gentle, wide, hole-free rest area.
 */
export function checkpointProblems(level: BuiltLevel): string[] {
  const def = level.def;
  const R = CHECKPOINT_RULES;
  const cps = def.checkpoints ?? [];
  const problems: string[] = [];
  const authored = def.segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
  const finishLine = level.finishS - ENTRANCE_LENGTH;
  if (cps.length > R.max) problems.push(`${cps.length} checkpoints (at most ${R.max})`);
  cps.forEach((s, i) => {
    const where = `checkpoint ${i} (s ${s})`;
    const prev = i === 0 ? 0 : cps[i - 1];
    if (s - prev < R.minGap) problems.push(`${where} is less than ${R.minGap} m after ${i === 0 ? 'the start' : `checkpoint ${i - 1}`}`);
    if (finishLine - s < R.minToFinish) problems.push(`${where} is less than ${R.minToFinish} m before the finish line`);
    if (s + R.restAfter > authored) problems.push(`${where} is too close to the end of the route`);
    for (let x = s - R.restBefore; x <= s + R.restAfter + 1e-9; x += 0.5) {
      if (level.widthAt(x + ENTRANCE_LENGTH) < R.minWidth) {
        problems.push(`${where}: narrower than ${R.minWidth} m at s ${x.toFixed(1)}`);
        break;
      }
    }
    for (let x = s - R.restBefore; x <= s + R.restBefore + 1e-9; x += 0.5) {
      const at = segmentAt(def, x);
      if (!at) continue;
      if (at.seg.kind !== 'straight') {
        problems.push(`${where}: not on a straight at s ${x.toFixed(1)}`);
        break;
      }
      if (at.grade < 0 || at.grade > R.maxGrade) {
        problems.push(`${where}: grade ${at.grade} at s ${x.toFixed(1)} (needs 0 to ${R.maxGrade})`);
        break;
      }
    }
    for (const h of def.holes ?? []) {
      if (h.s + h.r > s - R.restBefore && h.s - h.r < s + R.restAfter) problems.push(`${where}: hole at s ${h.s} is too close`);
    }
  });
  return problems;
}

/**
 * Index of the furthest checkpoint the ball at `s` has passed (absolute s), or `reached`
 * if none further. Checkpoints only ever move forward: rolling back doesn't undo one.
 */
export function passedCheckpoint(checkpoints: number[], s: number, reached: number): number {
  let k = reached;
  for (let i = reached + 1; i < checkpoints.length; i++) if (s >= checkpoints[i]) k = i;
  return k;
}

/** Minimal view of the path tracker needed by the rules. */
export interface TrackState {
  s: number;
  u: number;
  height: number;
}

export function hasFallen(level: BuiltLevel, t: TrackState, y: number): boolean {
  return t.height < -FALL_DEPTH || y < level.minY - 40;
}

export function hasFinished(level: BuiltLevel, t: TrackState): boolean {
  return t.s >= level.finishS && t.height > -0.8 && Math.abs(t.u) < level.widthAt(t.s) / 2 + 0.6;
}

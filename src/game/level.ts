import { Vector3 } from 'three';
import type { CoinSpot } from './coins';
import { buildPath, pathAt, straight, type PathData, type Segment } from './path';

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
  /** Default drop per horizontal meter. */
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
  theme: Theme;
}

/** Flat pad the ball spawns on. */
export const ENTRANCE_LENGTH = 7;
/** Flat area after the finish line where the ball brakes. */
export const RUNOUT_LENGTH = 12;
export const SPAWN_S = 3;
export const BALL_RADIUS = 0.5;
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
    spawnS: SPAWN_S,
    finishS: path.length - RUNOUT_LENGTH + 1.5,
    maxWidth,
    minY,
    widthAt,
  };
}

export function spawnPoint(level: BuiltLevel): Vector3 {
  const f = pathAt(level.path, level.spawnS);
  return f.pos.addScaledVector(f.normal, BALL_RADIUS + 0.01);
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

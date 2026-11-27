import type { BuiltLevel, BuiltPiece, CheckpointRef } from './level';
import { pathAt } from './path';

/*
 * The finish and the checkpoints are gates: two posts and a bar (or banner) across the
 * track. A gate counts only when the ball goes forward through its opening, rolling or in
 * the air. Going over it, around it, or landing past it without going through doesn't
 * count, and neither does going through backwards.
 */

/** Finish gate: post centers this far outside the track edge, banner center height, opening height. */
export const FINISH_GATE = { post: 0.4, banner: 3.4, top: 3.0 };
/** Checkpoint gate: post centers outside the track edge, bar center height, opening height. */
export const CHECKPOINT_GATE = { post: 0.35, bar: 2.8, top: 2.72 };
/** The opening reaches this far under the gate's surface point (banked or uneven track). */
const FLOOR = -0.5;

/** A gate's opening: a vertical rectangle across the track, facing the way forward. */
export interface Gate {
  /** Surface point at the middle of the track. */
  x: number;
  y: number;
  z: number;
  /** Horizontal unit vector forward along the track. */
  tx: number;
  tz: number;
  /** Horizontal unit vector to the right. */
  rx: number;
  rz: number;
  /** From the middle to each post's center. */
  halfWidth: number;
  /** Height of the opening above the surface point. */
  top: number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

export function gateAt(piece: BuiltPiece, s: number, kind: 'finish' | 'checkpoint'): Gate {
  const f = pathAt(piece.path, s);
  const spec = kind === 'finish' ? FINISH_GATE : CHECKPOINT_GATE;
  const th = Math.hypot(f.tan.x, f.tan.z) || 1;
  const rh = Math.hypot(f.right.x, f.right.z) || 1;
  return {
    x: f.pos.x,
    y: f.pos.y,
    z: f.pos.z,
    tx: f.tan.x / th,
    tz: f.tan.z / th,
    rx: f.right.x / rh,
    rz: f.right.z / rh,
    halfWidth: piece.widthAt(s) / 2 + spec.post,
    top: spec.top,
  };
}

/** Did the ball's move from `from` to `to` (one physics step) go forward through the gate's opening? */
export function throughGate(g: Gate, from: Point, to: Point): boolean {
  const d0 = (from.x - g.x) * g.tx + (from.z - g.z) * g.tz;
  const d1 = (to.x - g.x) * g.tx + (to.z - g.z) * g.tz;
  if (!(d0 < 0 && d1 >= 0)) return false;
  const k = d0 / (d0 - d1);
  const x = from.x + (to.x - from.x) * k;
  const y = from.y + (to.y - from.y) * k;
  const z = from.z + (to.z - from.z) * k;
  const u = (x - g.x) * g.rx + (z - g.z) * g.rz;
  const h = y - g.y;
  return Math.abs(u) < g.halfWidth && h > FLOOR && h < g.top;
}

/** The move went through the finish gate. */
export function hasFinished(level: BuiltLevel, from: Point, to: Point): boolean {
  return throughGate(level.finishGate, from, to);
}

/**
 * Index of the furthest checkpoint whose gate the move went through, or `reached` if none
 * further. Checkpoints only ever move forward: going back through an earlier gate changes nothing.
 */
export function passedCheckpoint(checkpoints: CheckpointRef[], from: Point, to: Point, reached: number): number {
  let k = reached;
  for (let i = reached + 1; i < checkpoints.length; i++) if (throughGate(checkpoints[i].gate, from, to)) k = i;
  return k;
}

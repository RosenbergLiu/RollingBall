import type { Vector3 } from 'three';
import { BALL_RADIUS, type BuiltLevel, type BuiltPiece, type TrackState } from './level';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Where a point is on a piece: the nearest sample, s along, u across, height above the surface. */
export interface Fix {
  index: number;
  s: number;
  u: number;
  height: number;
}

/** The ball counts as over a piece within this margin of its edges… */
const EDGE_MARGIN = 0.3;
/** …and while it isn't more than this far below its surface (center height)… */
const BELOW = -0.5;
/** …nor more than this far above it (for the drop landings found at build time). */
const ABOVE = 6;
/**
 * A ball over its piece counts as on it (not in the air) up to this much higher than resting.
 * (BALL_RADIUS is only read inside methods: level.ts and this module import each other.)
 */
const ON_TRACK_SLACK = 0.6;
/** The ball touches the surface: its center is within this of one radius above it. */
const CONTACT = 0.15;

/**
 * Follows the ball along the level's track pieces. While the ball rolls on a piece, the
 * nearest-sample search is limited to a window around the previous match, so a ball on an
 * upper spiral loop never jumps to the loop below. When the ball leaves its spot (past an
 * end, over an edge, into a hole) or is in the air, the tracker looks for the nearest
 * surface straight under it on every piece, the current one included and at any height:
 * the ball can land on any platform below it (drops, lower loops, shortcuts, going back).
 */
export class PathTracker implements TrackState {
  /** The piece the ball is on, or last left. */
  piece: BuiltPiece;
  index = 0;
  /** Distance along the piece (horizontal meters, absolute s). */
  s = 0;
  /** Lateral offset from the centerline (+ = right). */
  u = 0;
  /** Height of the ball center above the surface plane. */
  height = 0;
  /** The tracked spot is under the ball (false: nothing is below it, s/u/height are the last piece's). */
  over = true;

  constructor(
    private readonly level: BuiltLevel,
    private readonly windowMeters = 8,
  ) {
    this.piece = level;
  }

  reset(s: number, piece: BuiltPiece = this.level): void {
    this.piece = piece;
    const n = piece.path.samples.length;
    this.index = Math.min(n - 1, Math.max(0, Math.round(s / piece.path.ds)));
    this.s = s;
    this.u = 0;
    this.height = BALL_RADIUS;
    this.over = true;
  }

  /** The ball is touching the surface it is over (not in the air, not falling). */
  get grounded(): boolean {
    return this.over && Math.abs(this.height - BALL_RADIUS) < CONTACT;
  }

  update(p: Vec3Like): void {
    const fix = locateOnPiece(this.piece, p, this.index, this.windowMeters);
    if (this.isOver(this.piece, fix) && fix.height < BALL_RADIUS + ON_TRACK_SLACK) {
      this.apply(this.piece, fix, true);
      return;
    }
    const below = this.surfaceBelow(p);
    if (below) this.apply(below.piece, below.fix, true);
    else this.apply(this.piece, fix, false);
  }

  /** Smoothed horizontal direction of travel around the tracked point. */
  heading(out: Vector3): Vector3 {
    const { samples } = this.piece.path;
    const n = samples.length;
    const a = samples[Math.max(0, this.index - 4)].pos;
    const b = samples[Math.min(n - 1, this.index + 16)].pos;
    out.set(b.x - a.x, 0, b.z - a.z);
    if (out.lengthSq() < 1e-8) out.set(0, 0, -1);
    return out.normalize();
  }

  private apply(piece: BuiltPiece, f: Fix, over: boolean): void {
    this.piece = piece;
    this.over = over;
    this.index = f.index;
    this.s = f.s;
    this.u = f.u;
    this.height = f.height;
  }

  /** The ball is over this piece: between its ends, inside its edges, not below it. */
  private isOver(piece: BuiltPiece, f: Fix): boolean {
    return f.s >= 0 && f.s <= piece.path.length && Math.abs(f.u) <= piece.widthAt(f.s) / 2 + EDGE_MARGIN && f.height > BELOW;
  }

  /** The surface right under the ball on any piece, at any depth (the closest one wins), or null. */
  private surfaceBelow(p: Vec3Like): { piece: BuiltPiece; fix: Fix } | null {
    let best: { piece: BuiltPiece; fix: Fix } | null = null;
    for (const piece of this.level.pieces) {
      const start = closestUnder(piece, p, Infinity);
      if (start < 0) continue;
      const fix = locateOnPiece(piece, p, start, this.windowMeters);
      if (!this.isOver(piece, fix)) continue;
      if (!best || fix.height < best.fix.height) best = { piece, fix };
    }
    return best;
  }
}

/**
 * A sample of `piece` the point is horizontally close to and above, by at most `maxAbove`
 * (or -1): a coarse scan, so that where a piece passes over itself the loop right under the
 * point is picked.
 */
export function closestUnder(piece: BuiltPiece, p: Vec3Like, maxAbove = ABOVE + 1): number {
  const { samples } = piece.path;
  const reach = piece.maxWidth / 2 + 1;
  let best = -1;
  let bestDy = Infinity;
  for (let k = 0; k < samples.length; k += 2) {
    const q = samples[k].pos;
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    if (dx * dx + dz * dz > reach * reach) continue;
    const dy = p.y - q.y;
    if (dy < BELOW || dy > maxAbove) continue;
    if (dy < bestDy) {
      bestDy = dy;
      best = k;
    }
  }
  return best;
}

/** Nearest sample on `piece` within `windowMeters` of sample `around`, and the point's s, u, height there. */
export function locateOnPiece(piece: BuiltPiece, p: Vec3Like, around: number, windowMeters = 8): Fix {
  const { samples, ds } = piece.path;
  const win = Math.ceil(windowMeters / ds);
  const lo = Math.max(0, around - win);
  const hi = Math.min(samples.length - 1, around + win);
  let best = around;
  let bestD = Infinity;
  for (let k = lo; k <= hi; k++) {
    const q = samples[k].pos;
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  const smp = samples[best];
  const rx = p.x - smp.pos.x;
  const ry = p.y - smp.pos.y;
  const rz = p.z - smp.pos.z;
  const th = Math.hypot(smp.tan.x, smp.tan.z) || 1;
  return {
    index: best,
    u: rx * smp.right.x + rz * smp.right.z,
    height: rx * smp.normal.x + ry * smp.normal.y + rz * smp.normal.z,
    s: best * ds + (rx * smp.tan.x + rz * smp.tan.z) / th,
  };
}

/** Is the point on (or within `tolerance` of) the top surface of `piece`, inside its edges by `inset`? */
export function onPieceSurface(piece: BuiltPiece, p: Vec3Like, inset = 0, tolerance = 0.05): boolean {
  const start = closestUnder(piece, { x: p.x, y: p.y + tolerance, z: p.z });
  if (start < 0) return false;
  const f = locateOnPiece(piece, p, start);
  return f.s >= 0 && f.s <= piece.path.length && Math.abs(f.u) <= piece.widthAt(f.s) / 2 - inset && Math.abs(f.height) <= tolerance;
}

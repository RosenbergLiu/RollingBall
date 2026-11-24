import type { Vector3 } from 'three';
import type { BuiltLevel, BuiltPiece, TrackState } from './level';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface Fix {
  index: number;
  s: number;
  u: number;
  height: number;
}

/** The ball counts as over a piece within this margin of its edges… */
const EDGE_MARGIN = 0.3;
/** …and while it isn't more than this far below its surface (center height)… */
const BELOW = -0.5;
/** …nor more than this far above it (a piece far below doesn't catch the ball). */
const ABOVE = 6;

/**
 * Follows the ball along the level's track pieces. On a piece, the nearest-sample search
 * is limited to a window around the previous match, so a ball that falls from an upper
 * spiral loop keeps tracking the loop it fell from (and is detected as fallen) instead of
 * "landing" on the loop below. When the ball leaves its piece (past an end, over an edge)
 * and is over another piece, close above its surface, the tracker moves to that piece:
 * that is how drops and other multi-piece routes work.
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
    this.height = 0;
  }

  update(p: Vec3Like): void {
    const fix = this.locate(this.piece, p, this.index);
    this.apply(this.piece, fix);
    if (this.level.pieces.length > 1 && !this.isOver(this.piece, fix)) this.findOtherPiece(p);
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

  private apply(piece: BuiltPiece, f: Fix): void {
    this.piece = piece;
    this.index = f.index;
    this.s = f.s;
    this.u = f.u;
    this.height = f.height;
  }

  /** The ball is over this piece: between its ends, inside its edges, not below it. */
  private isOver(piece: BuiltPiece, f: Fix): boolean {
    return (
      f.s >= 0 &&
      f.s <= piece.path.length &&
      Math.abs(f.u) <= piece.widthAt(f.s) / 2 + EDGE_MARGIN &&
      f.height > BELOW &&
      f.height < ABOVE
    );
  }

  /** Moves to the piece right under the ball, if there is one (the closest surface below wins). */
  private findOtherPiece(p: Vec3Like): void {
    let best: { piece: BuiltPiece; fix: Fix } | null = null;
    for (const piece of this.level.pieces) {
      if (piece === this.piece) continue;
      const start = this.closestUnder(piece, p);
      if (start < 0) continue;
      const fix = this.locate(piece, p, start);
      if (!this.isOver(piece, fix)) continue;
      if (!best || fix.height < best.fix.height) best = { piece, fix };
    }
    if (best) this.apply(best.piece, best.fix);
  }

  /**
   * A sample of `piece` the ball is horizontally close to and above (or -1): a coarse scan,
   * so that where a piece passes over itself the loop right under the ball is picked.
   */
  private closestUnder(piece: BuiltPiece, p: Vec3Like): number {
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
      if (dy < BELOW || dy > ABOVE + 1) continue;
      if (dy < bestDy) {
        bestDy = dy;
        best = k;
      }
    }
    return best;
  }

  /** Nearest sample on `piece` within the search window around `around`, and the ball's s, u, height there. */
  private locate(piece: BuiltPiece, p: Vec3Like, around: number): Fix {
    const { samples, ds } = piece.path;
    const win = Math.ceil(this.windowMeters / ds);
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
}

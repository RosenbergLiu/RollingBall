import type { Vector3 } from 'three';
import type { BuiltLevel, TrackState } from './level';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Follows the ball along the level centerline. The nearest-sample search is limited to a
 * window around the previous match, so a ball that falls from an upper spiral loop keeps
 * tracking the loop it fell from (and is detected as fallen) instead of "landing" on the
 * loop below.
 */
export class PathTracker implements TrackState {
  index = 0;
  /** Distance along the path (horizontal meters). */
  s = 0;
  /** Lateral offset from the centerline (+ = right). */
  u = 0;
  /** Height of the ball center above the surface plane. */
  height = 0;

  constructor(
    private readonly level: BuiltLevel,
    private readonly windowMeters = 8,
  ) {}

  reset(s: number): void {
    const n = this.level.path.samples.length;
    this.index = Math.min(n - 1, Math.max(0, Math.round(s / this.level.path.ds)));
    this.s = s;
    this.u = 0;
    this.height = 0;
  }

  update(p: Vec3Like): void {
    const { samples, ds } = this.level.path;
    const win = Math.ceil(this.windowMeters / ds);
    const lo = Math.max(0, this.index - win);
    const hi = Math.min(samples.length - 1, this.index + win);
    let best = this.index;
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
    this.index = best;
    const smp = samples[best];
    const rx = p.x - smp.pos.x;
    const ry = p.y - smp.pos.y;
    const rz = p.z - smp.pos.z;
    this.u = rx * smp.right.x + rz * smp.right.z;
    this.height = rx * smp.normal.x + ry * smp.normal.y + rz * smp.normal.z;
    const th = Math.hypot(smp.tan.x, smp.tan.z) || 1;
    this.s = best * ds + (rx * smp.tan.x + rz * smp.tan.z) / th;
  }

  /** Smoothed horizontal direction of travel around the tracked point. */
  heading(out: Vector3): Vector3 {
    const { samples } = this.level.path;
    const n = samples.length;
    const a = samples[Math.max(0, this.index - 4)].pos;
    const b = samples[Math.min(n - 1, this.index + 16)].pos;
    out.set(b.x - a.x, 0, b.z - a.z);
    if (out.lengthSq() < 1e-8) out.set(0, 0, -1);
    return out.normalize();
  }
}

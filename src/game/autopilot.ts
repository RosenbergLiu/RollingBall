import { holeDistance, type BuiltLevel, type BuiltPiece } from './level';
import { pathAt } from './path';
import { PHYSICS, type Vec3 } from './physics';
import type { PathTracker, Vec3Like } from './tracker';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * A simple driver that steers toward a safe lateral line a few meters ahead. Used for the
 * menu's attract mode and by the tests to prove every level can be completed.
 */
export class Autopilot {
  cruiseSpeed = 8;

  /** The level it drives on (it steers on whichever of its pieces the ball is on). */
  constructor(readonly level: BuiltLevel) {}

  /** How dangerous it is for the ball center to be at (s, u) on a piece. */
  private danger(piece: BuiltPiece, s: number, u: number): number {
    let c = 0;
    const clearEdge = piece.widthAt(s) / 2 - 0.75 - Math.abs(u);
    if (clearEdge < 0.5) c += (0.5 - clearEdge) * 25;
    for (const h of piece.holes) {
      if (Math.abs(s - h.s) > (h.r + 2.5) / Math.min(1, h.m)) continue;
      const clear = holeDistance(h, s, u) - h.r - 0.5;
      if (clear < 0.9) c += (0.9 - clear) * 20;
    }
    return c;
  }

  compute(tracker: PathTracker, pos: Vec3Like, vel: Vec3Like, out: Vec3): Vec3 {
    // Drive on whichever piece the ball is on (a drop moves it to the piece below).
    const L = tracker.piece;
    const speed = Math.hypot(vel.x, vel.z);
    const look = clamp(2.5 + speed * 0.4, 3, 7);
    const s0 = tracker.s;
    const u0 = tracker.u;
    const sT = Math.min(s0 + look, L.path.length);
    const half = Math.max(0, L.widthAt(sT) / 2 - 0.8);

    let bestU = 0;
    let bestCost = Infinity;
    const steps = Math.floor(half / 0.2);
    for (let k = -steps; k <= steps; k++) {
      const u = steps === 0 ? 0 : (k / steps) * half;
      let cost = 0.05 * Math.abs(u) + 0.15 * Math.abs(u - u0);
      for (let q = 1; q <= 8; q++) {
        const f = q / 8;
        cost += this.danger(L, s0 + (sT - s0) * f, u0 + (u - u0) * f) * (1.2 - f * 0.5);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestU = u;
      }
    }

    const frame = pathAt(L.path, sT);
    const tx = frame.pos.x + frame.right.x * bestU;
    const tz = frame.pos.z + frame.right.z * bestU;

    // Pick a speed that suits what is coming up.
    let vDes = this.cruiseSpeed;
    let kMax = 0;
    let wMin = Infinity;
    for (let q = 0; q <= 10; q++) {
      const s = s0 + q;
      kMax = Math.max(kMax, Math.abs(pathAt(L.path, s).curvature));
      wMin = Math.min(wMin, L.widthAt(s));
    }
    if (kMax > 0) vDes = Math.min(vDes, Math.sqrt(7 / kMax));
    vDes = Math.min(vDes, 2.5 + wMin * 1.2);
    if (L.holes.some((h) => h.s > s0 - 1 && h.s < s0 + 9)) vDes = Math.min(vDes, 6.5);

    let dx = tx - pos.x;
    let dz = tz - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    let ax = (dx * vDes - vel.x) * 3;
    let az = (dz * vDes - vel.z) * 3;
    const mag = Math.hypot(ax, az);
    const max = PHYSICS.maxAccel * 0.8;
    if (mag > max) {
      ax *= max / mag;
      az *= max / mag;
    }
    out.x = ax;
    out.y = 0;
    out.z = az;
    return out;
  }
}

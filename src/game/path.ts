import { Vector3 } from 'three';

/**
 * A level's centerline is authored as a list of "turtle" segments: straights and arcs,
 * each with a grade: the drop per horizontal meter. Positive goes downhill, 0 is flat and
 * negative climbs. A route may mix all three (see MAX_GRADE in level.ts for the limits).
 */
export type Segment =
  | { kind: 'straight'; length: number; grade?: number }
  | { kind: 'arc'; angle: number; radius: number; grade?: number };

export const straight = (length: number, grade?: number): Segment => ({ kind: 'straight', length, grade });
/** Arc turning left (counter-clockwise seen from above). */
export const left = (angleDeg: number, radius: number, grade?: number): Segment => ({
  kind: 'arc',
  angle: angleDeg,
  radius,
  grade,
});
/** Arc turning right (clockwise seen from above). */
export const right = (angleDeg: number, radius: number, grade?: number): Segment => ({
  kind: 'arc',
  angle: -angleDeg,
  radius,
  grade,
});

export function segmentLength(seg: Segment): number {
  return seg.kind === 'straight' ? seg.length : ((Math.abs(seg.angle) * Math.PI) / 180) * seg.radius;
}

export interface PathSample {
  pos: Vector3;
  /** Unit tangent, pointing forward along the route (down, level or up the slope). */
  tan: Vector3;
  /** Horizontal unit vector pointing to the right of the direction of travel. */
  right: Vector3;
  /** Surface normal (up-ish). */
  normal: Vector3;
  /** Signed curvature dθ/ds, positive for left turns. */
  curvature: number;
}

export interface PathData {
  /** Horizontal distance between samples. */
  ds: number;
  samples: PathSample[];
  /** Total horizontal length. */
  length: number;
}

export type PathFrame = PathSample;

/** Heading 0 faces -Z; positive heading turns left (toward -X). */
const dirX = (h: number) => -Math.sin(h);
const dirZ = (h: number) => -Math.cos(h);

export function buildPath(segments: Segment[], defaultGrade: number, ds = 0.25, smoothMeters = 5): PathData {
  const startHeading: number[] = [];
  const endHeading: number[] = [];
  const stepGrade: number[] = [];
  const stepCurv: number[] = [];
  let heading = 0;
  for (const seg of segments) {
    const n = Math.max(1, Math.round(segmentLength(seg) / ds));
    const grade = seg.grade ?? defaultGrade;
    const dTheta = seg.kind === 'arc' ? (seg.angle * Math.PI) / 180 / n : 0;
    const k = seg.kind === 'arc' ? Math.sign(seg.angle) / seg.radius : 0;
    for (let i = 0; i < n; i++) {
      startHeading.push(heading);
      heading += dTheta;
      endHeading.push(heading);
      stepGrade.push(grade);
      stepCurv.push(k);
    }
  }
  const steps = stepGrade.length;

  // Smooth the grade so slope changes are gentle: no kinks for the ball to bounce on.
  const half = Math.max(1, Math.round(smoothMeters / ds / 2));
  const prefix = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i++) prefix[i + 1] = prefix[i] + stepGrade[i];
  const grade = new Float64Array(steps);
  for (let i = 0; i < steps; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(steps, i + half + 1);
    grade[i] = (prefix[b] - prefix[a]) / (b - a);
  }

  const samples: PathSample[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i <= steps; i++) {
    const h = i === 0 ? 0 : endHeading[i - 1];
    const g = i === 0 ? grade[0] : i === steps ? grade[steps - 1] : (grade[i - 1] + grade[i]) / 2;
    const k = i === 0 ? stepCurv[0] : i === steps ? stepCurv[steps - 1] : (stepCurv[i - 1] + stepCurv[i]) / 2;
    const tan = new Vector3(dirX(h), -g, dirZ(h)).normalize();
    const rightV = new Vector3(Math.cos(h), 0, -Math.sin(h));
    const normal = new Vector3().crossVectors(rightV, tan).normalize();
    samples.push({ pos: new Vector3(x, y, z), tan, right: rightV, normal, curvature: k });
    if (i < steps) {
      const hm = (startHeading[i] + endHeading[i]) / 2;
      x += dirX(hm) * ds;
      z += dirZ(hm) * ds;
      y -= grade[i] * ds;
    }
  }
  return { ds, samples, length: steps * ds };
}

/** Interpolated frame at horizontal arc length `s` (clamped to the path). Returns fresh vectors. */
export function pathAt(path: PathData, s: number): PathFrame {
  const n = path.samples.length;
  const t = Math.min(Math.max(s / path.ds, 0), n - 1);
  const i = Math.min(Math.floor(t), n - 2);
  const f = t - i;
  const a = path.samples[i];
  const b = path.samples[i + 1];
  return {
    pos: a.pos.clone().lerp(b.pos, f),
    tan: a.tan.clone().lerp(b.tan, f).normalize(),
    right: a.right.clone().lerp(b.right, f).normalize(),
    normal: a.normal.clone().lerp(b.normal, f).normalize(),
    curvature: a.curvature + (b.curvature - a.curvature) * f,
  };
}

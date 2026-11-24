import { Vector3 } from 'three';
import { holeDistance, type BuiltHole, type BuiltLevel } from './level';
import { pathAt } from './path';

export interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export const emptyMesh = (): MeshArrays => ({ positions: [], normals: [], uvs: [], indices: [] });

export interface ColliderMesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface PlatformMesh {
  /** Walkable top surface (tile material). */
  top: MeshArrays;
  /** Slab side walls around the outline and inside holes. */
  walls: MeshArrays;
  /** Underside of the slab. */
  bottom: MeshArrays;
  /** Thin glowing strip along every edge of the top surface. */
  rim: MeshArrays;
  topCollider: ColliderMesh;
  wallCollider: ColliderMesh;
  cells: { total: number; removed: number };
}

export interface PlatformOptions {
  /** Target grid cell size in meters. */
  cell: number;
  thickness: number;
  /** Meters per texture repeat. */
  tile: number;
  rimWidth: number;
}

export const PLATFORM_DEFAULTS: PlatformOptions = { cell: 0.4, thickness: 0.9, tile: 4, rimWidth: 0.1 };

function pushVertex(m: MeshArrays, p: Vector3, n: Vector3, u: number, v: number): void {
  m.positions.push(p.x, p.y, p.z);
  m.normals.push(n.x, n.y, n.z);
  m.uvs.push(u, v);
}

function toCollider(m: MeshArrays): ColliderMesh {
  return { vertices: new Float32Array(m.positions), indices: new Uint32Array(m.indices) };
}

/** Moves a hole-boundary vertex onto the hole's circle so holes look round. */
function snapToHole(holes: BuiltHole[], VS: Float64Array, VU: Float64Array, k: number, onEdge: boolean): void {
  const s = VS[k];
  const u = VU[k];
  let best: BuiltHole | null = null;
  let bestRatio = Infinity;
  for (const h of holes) {
    const ratio = holeDistance(h, s, u) / h.r;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = h;
    }
  }
  if (!best || bestRatio > 1.8) return;
  const h = best;
  if (onEdge) {
    // Outline vertices keep their lateral position; slide them along the edge instead.
    const du = u - h.u;
    const rem = h.r * h.r - du * du;
    if (rem <= 0) return;
    const ns = h.s + (s >= h.s ? 1 : -1) * (Math.sqrt(rem) / h.m);
    if (Math.abs(ns - s) < 0.6) VS[k] = ns;
    return;
  }
  const dS = (s - h.s) * h.m;
  const dU = u - h.u;
  const len = Math.hypot(dS, dU);
  if (len < 1e-6) return;
  VS[k] = h.s + ((dS / len) * h.r) / h.m;
  VU[k] = h.u + (dU / len) * h.r;
}

/**
 * Builds the platform as a grid in (arc length, lateral offset) space. Cells inside holes
 * are removed, boundary vertices are snapped onto the hole circles, and walls, rim strips
 * and an underside are generated for every open edge.
 */
export function buildPlatform(level: BuiltLevel, options: Partial<PlatformOptions> = {}): PlatformMesh {
  const o = { ...PLATFORM_DEFAULTS, ...options };
  const { path } = level;
  const n = path.samples.length;
  const rowStep = Math.max(1, Math.round(o.cell / path.ds));
  const rowS: number[] = [];
  for (let k = 0; k < n; k += rowStep) rowS.push(k * path.ds);
  if ((n - 1) % rowStep !== 0) rowS.push((n - 1) * path.ds);
  const nv = rowS.length - 1;
  const nu = Math.max(2, Math.ceil(level.maxWidth / o.cell));
  const rowLen = nu + 1;
  const vid = (i: number, j: number) => j * rowLen + i;
  const cid = (i: number, j: number) => j * nu + i;
  const vCount = rowLen * (nv + 1);

  const VS = new Float64Array(vCount);
  const VU = new Float64Array(vCount);
  for (let j = 0; j <= nv; j++) {
    const s = rowS[j];
    const w = level.widthAt(s);
    for (let i = 0; i <= nu; i++) {
      VS[vid(i, j)] = s;
      VU[vid(i, j)] = (i / nu - 0.5) * w;
    }
  }

  // Remove cells whose center lies inside a hole.
  const removed = new Uint8Array(nu * nv);
  if (level.holes.length > 0) {
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = vid(i, j);
        const b = vid(i + 1, j);
        const c = vid(i + 1, j + 1);
        const d = vid(i, j + 1);
        const sc = (VS[a] + VS[c]) / 2;
        const uc = (VU[a] + VU[b] + VU[c] + VU[d]) / 4;
        if (level.holes.some((h) => holeDistance(h, sc, uc) < h.r)) removed[cid(i, j)] = 1;
      }
    }
    // Avoid "bow-tie" vertices where two kept cells touch only at a corner.
    for (let j = 0; j < nv - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const p = removed[cid(i, j)];
        const q = removed[cid(i + 1, j)];
        const r = removed[cid(i, j + 1)];
        const t = removed[cid(i + 1, j + 1)];
        if (p === t && q === r && p !== q) {
          removed[cid(i, j)] = removed[cid(i + 1, j)] = removed[cid(i, j + 1)] = removed[cid(i + 1, j + 1)] = 1;
        }
      }
    }
  }
  let removedCount = 0;
  for (let k = 0; k < removed.length; k++) removedCount += removed[k];

  const inGrid = (i: number, j: number) => i >= 0 && i < nu && j >= 0 && j < nv;
  const kept = (i: number, j: number) => inGrid(i, j) && removed[cid(i, j)] === 0;
  const isHole = (i: number, j: number) => inGrid(i, j) && removed[cid(i, j)] === 1;

  if (removedCount > 0) {
    for (let j = 1; j < nv; j++) {
      for (let i = 0; i <= nu; i++) {
        let touchesHole = false;
        let touchesKept = false;
        for (const [ci, cj] of [
          [i - 1, j - 1],
          [i, j - 1],
          [i - 1, j],
          [i, j],
        ]) {
          if (isHole(ci, cj)) touchesHole = true;
          else if (kept(ci, cj)) touchesKept = true;
        }
        if (touchesHole && touchesKept) snapToHole(level.holes, VS, VU, vid(i, j), i === 0 || i === nu);
      }
    }
  }

  // 3D positions and normals.
  const P: Vector3[] = new Array(vCount);
  const N: Vector3[] = new Array(vCount);
  for (let k = 0; k < vCount; k++) {
    const f = pathAt(path, VS[k]);
    P[k] = f.pos.addScaledVector(f.right, VU[k]);
    N[k] = f.normal;
  }

  const top = emptyMesh();
  for (let k = 0; k < vCount; k++) pushVertex(top, P[k], N[k], VU[k] / o.tile, VS[k] / o.tile);
  const e1 = new Vector3();
  const e2 = new Vector3();
  const cr = new Vector3();
  const pushTri = (m: MeshArrays, a: number, b: number, c: number) => {
    e1.subVectors(P[b], P[a]);
    e2.subVectors(P[c], P[a]);
    if (cr.crossVectors(e1, e2).lengthSq() > 1e-10) m.indices.push(a, b, c);
  };

  const walls = emptyMesh();
  const rim = emptyMesh();
  const bottom = emptyMesh();
  const t = o.thickness;
  const center = new Vector3();

  const addEdge = (ea: number, eb: number) => {
    const p0 = P[ea];
    const p1 = P[eb];
    const q0 = p0.clone().addScaledVector(N[ea], -t);
    const q1 = p1.clone().addScaledVector(N[eb], -t);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const outward = mid.clone().sub(center);
    const edge = p1.clone().sub(p0);
    const len = edge.length();
    if (len < 1e-5) return;
    const fn = new Vector3().crossVectors(edge, q0.clone().sub(p0)).normalize();
    let A = p0;
    let B = p1;
    let C = q1;
    let D = q0;
    if (fn.dot(outward) < 0) {
      fn.negate();
      A = p1;
      B = p0;
      C = q0;
      D = q1;
    }
    const base = walls.positions.length / 3;
    pushVertex(walls, A, fn, 0, 0);
    pushVertex(walls, B, fn, len / o.tile, 0);
    pushVertex(walls, C, fn, len / o.tile, t / o.tile);
    pushVertex(walls, D, fn, 0, t / o.tile);
    walls.indices.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);

    // Rim strip lying on the top surface just inside the edge.
    const nAvg = N[ea].clone().add(N[eb]).normalize();
    const inward = center.clone().sub(mid);
    inward.addScaledVector(nAvg, -inward.dot(nAvg)).normalize();
    const lift = nAvg.clone().multiplyScalar(0.012);
    const r0 = p0.clone().add(lift);
    const r1 = p1.clone().add(lift);
    const r2 = p1.clone().addScaledVector(inward, o.rimWidth).add(lift);
    const r3 = p0.clone().addScaledVector(inward, o.rimWidth).add(lift);
    const rb = rim.positions.length / 3;
    pushVertex(rim, r0, nAvg, 0, 0);
    pushVertex(rim, r1, nAvg, 1, 0);
    pushVertex(rim, r2, nAvg, 1, 1);
    pushVertex(rim, r3, nAvg, 0, 1);
    const up = new Vector3().crossVectors(r1.clone().sub(r0), r3.clone().sub(r0)).dot(nAvg) >= 0;
    if (up) rim.indices.push(rb, rb + 1, rb + 2, rb, rb + 2, rb + 3);
    else rim.indices.push(rb, rb + 2, rb + 1, rb, rb + 3, rb + 2);
  };

  for (let k = 0; k < vCount; k++) {
    pushVertex(bottom, P[k].clone().addScaledVector(N[k], -t), N[k].clone().negate(), VU[k] / o.tile, VS[k] / o.tile);
  }

  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      if (!kept(i, j)) continue;
      const a = vid(i, j);
      const b = vid(i + 1, j);
      const c = vid(i + 1, j + 1);
      const d = vid(i, j + 1);
      // Counter-clockwise seen from above: right vector × forward = up.
      pushTri(top, a, b, c);
      pushTri(top, a, c, d);
      bottom.indices.push(a, c, b, a, d, c);
      center.copy(P[a]).add(P[b]).add(P[c]).add(P[d]).multiplyScalar(0.25);
      if (!kept(i, j - 1)) addEdge(a, b);
      if (!kept(i + 1, j)) addEdge(b, c);
      if (!kept(i, j + 1)) addEdge(c, d);
      if (!kept(i - 1, j)) addEdge(d, a);
    }
  }

  return {
    top,
    walls,
    bottom,
    rim,
    topCollider: toCollider(top),
    wallCollider: toCollider(walls),
    cells: { total: nu * nv, removed: removedCount },
  };
}

/** A strip covering the full platform width between s0 and s1, lifted above the surface. */
export function buildStrip(level: BuiltLevel, s0: number, s1: number, lift: number, segments = 8): MeshArrays {
  const out = emptyMesh();
  const rows = Math.max(1, Math.ceil((s1 - s0) / 0.25));
  for (let j = 0; j <= rows; j++) {
    const s = s0 + ((s1 - s0) * j) / rows;
    const f = pathAt(level.path, s);
    const w = level.widthAt(s);
    for (let i = 0; i <= segments; i++) {
      const u = (i / segments - 0.5) * w;
      const p = f.pos.clone().addScaledVector(f.right, u).addScaledVector(f.normal, lift);
      pushVertex(out, p, f.normal, u + w / 2, s - s0);
    }
  }
  const rl = segments + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * rl + i;
      const b = a + 1;
      const c = a + rl + 1;
      const d = a + rl;
      out.indices.push(a, b, c, a, c, d);
    }
  }
  return out;
}

/**
 * A patch on the surface between s0 and s1 and across [u0, u1] (default: the full width
 * minus a sliver), lifted above it and shrunk by `inset` on every side. UVs are in meters:
 * u across from the patch's left edge, v along from s0.
 */
export function buildPatch(
  level: BuiltLevel,
  s0: number,
  s1: number,
  u0: number | undefined,
  u1: number | undefined,
  lift: number,
  inset = 0,
  columns = 4,
): MeshArrays {
  const out = emptyMesh();
  const a = s0 + inset;
  const b = s1 - inset;
  if (!(b > a)) return out;
  const rows = Math.max(1, Math.ceil((b - a) / 0.25));
  for (let j = 0; j <= rows; j++) {
    const s = a + ((b - a) * j) / rows;
    const f = pathAt(level.path, s);
    const half = level.widthAt(s) / 2 - 0.05;
    const left = (u0 ?? -half) + inset;
    const right = (u1 ?? half) - inset;
    for (let i = 0; i <= columns; i++) {
      const u = left + ((right - left) * i) / columns;
      const p = f.pos.clone().addScaledVector(f.right, u).addScaledVector(f.normal, lift);
      pushVertex(out, p, f.normal, u - left, s - a);
    }
  }
  const rl = columns + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const p = j * rl + i;
      out.indices.push(p, p + 1, p + rl + 1, p, p + rl + 1, p + rl);
    }
  }
  return out;
}

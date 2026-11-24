import type { CoinSpot } from './coins';
import type { BuiltLevel, BuiltPiece, Hole, PieceDef } from './level';
import { left, pathAt, right, straight, type Segment } from './path';
import type { Surface } from './surfaces';
import { locateOnPiece } from './tracker';

/*
 * Forks and merges (docs/level-design-guide.md §7.1): the route splits in two and the two
 * ways meet again. Built on track pieces (level.ts): a branch is a piece that starts from
 * the main route and whose end rejoins it (`to`).
 *
 * The physics engine only smooths the joins inside one mesh, so where two pieces overlap
 * their surfaces must be exactly level with each other, or the ball bumps on a seam. A
 * `swing` makes that easy: its first and last bends are flat, and the main route and its
 * branch swing out mirror-image, so wherever they overlap they are at the same height.
 */

export const FORK = {
  /** Where two pieces overlap at a junction, their surfaces may differ by at most this (m). */
  maxStep: 0.005,
  /** A branch's end lines up with the track it rejoins: position (m), height (m), heading (degrees). */
  maxMergeGap: 0.2,
  maxMergeStep: 0.02,
  maxMergeTurn: 3,
  /** A branch is at most this many times longer (or shorter) than the stretch it bypasses. */
  maxLengthRatio: 1.3,
  /** The two ways really separate: at their middle, at least this much open gap between them. */
  minGap: 2,
  /** The track is at least this wide where a branch leaves and where it rejoins. */
  minJunctionWidth: 6,
  /** How far from a junction the overlap and hole checks look (m). */
  junction: 15,
};

/**
 * Segments that swing out to one side by `offset` meters and back onto the same line,
 * heading the same way: out, back, a straight `middle`, back, out. The first and last
 * bends are flat (that's where a fork's two tracks overlap); the slope is in between.
 */
export function swing(side: 'left' | 'right', offset: number, radius: number, middle: number, grade: number): Segment[] {
  const theta = (Math.acos(1 - offset / (2 * radius)) * 180) / Math.PI;
  const out = side === 'left' ? left : right;
  const back = side === 'left' ? right : left;
  return [out(theta, radius, 0), back(theta, radius, grade), straight(middle, grade), back(theta, radius, grade), out(theta, radius, 0)];
}

/** Length along the track of a swing (all four bends and the middle). */
export function swingLength(offset: number, radius: number, middle: number): number {
  return 4 * radius * Math.acos(1 - offset / (2 * radius)) + middle;
}

export interface ForkOptions {
  /** The piece the branch leaves and rejoins (default 'main'). */
  from?: string;
  /** Authored s where both ways start their swings. */
  at: number;
  /** The branch's side; the main route swings the other way (use swing() there). */
  side: 'left' | 'right';
  offset: number;
  radius: number;
  middle: number;
  grade: number;
}

export interface BranchContent {
  width: [number, number][];
  holes?: Hole[];
  coins?: CoinSpot[];
  surfaces?: Surface[];
}

/**
 * The branch of a fork: it swings out to `side` from `at` and rejoins its piece where that
 * piece's own (mirror-image) swing ends. Put `swing(otherSide, offset, radius, middle,
 * grade)` into the main route's segments starting at `at`.
 */
export function forkBranch(id: string, fork: ForkOptions, content: BranchContent): PieceDef {
  const from = fork.from ?? 'main';
  return {
    id,
    from: { piece: from, s: fork.at },
    segments: swing(fork.side, fork.offset, fork.radius, fork.middle, fork.grade),
    to: { piece: from, s: fork.at + swingLength(fork.offset, fork.radius, fork.middle) },
    ...content,
  };
}

const D2R = Math.PI / 180;

/** Every fork and route rule a level breaks (empty when valid). */
export function forkProblems(level: BuiltLevel): string[] {
  const problems: string[] = [];
  const byId = new Map(level.pieces.map((p) => [p.id, p]));

  // No dead ends: every piece but the finish rejoins another or ends in a drop.
  for (const p of level.pieces) {
    if (p === level.finish || p.merge) continue;
    const dropsOn = level.pieces.some((c) => c.attach?.piece === p.id && c.attach.s >= p.path.length - 5);
    if (!dropsOn) problems.push(`piece ${p.id} is a dead end (it doesn't rejoin another piece, drop or finish)`);
  }

  for (const branch of level.pieces) {
    if (!branch.merge || !branch.attach) continue;
    const parent = byId.get(branch.attach.piece);
    const target = byId.get(branch.merge.piece);
    if (!parent || !target) continue;
    const where = `branch ${branch.id}`;

    // The end lines up with the track it rejoins.
    const end = branch.path.samples[branch.path.samples.length - 1];
    const join = pathAt(target.path, branch.merge.s);
    const gap = Math.hypot(end.pos.x - join.pos.x, end.pos.z - join.pos.z);
    const step = end.pos.y - join.pos.y;
    const turn = Math.abs(Math.atan2(end.tan.x * join.tan.z - end.tan.z * join.tan.x, end.tan.x * join.tan.x + end.tan.z * join.tan.z)) / D2R;
    if (gap > FORK.maxMergeGap || Math.abs(step) > FORK.maxMergeStep || turn > FORK.maxMergeTurn) {
      problems.push(
        `${where} doesn't line up where it rejoins ${target.id} (off by ${gap.toFixed(2)} m, ${step.toFixed(3)} m high, ${turn.toFixed(1)}°)`,
      );
    }

    // Wherever it overlaps the track it leaves or joins, the two surfaces are level with each other.
    const len = branch.path.length;
    const zones: [BuiltPiece, number, number, number][] = [
      [parent, 0, Math.min(FORK.junction, len), branch.attach.s],
      [target, Math.max(0, len - FORK.junction), len, branch.merge.s - len],
    ];
    for (const [other, s0, s1, shift] of zones) {
      let worst = 0;
      let worstAt = 0;
      for (let s = s0; s <= s1 + 1e-9; s += 0.5) {
        const f = pathAt(branch.path, s);
        const half = branch.widthAt(s) / 2 - 0.05;
        for (const k of [-1, 0, 1]) {
          const p = f.pos.clone().addScaledVector(f.right, k * half);
          const around = Math.min(other.path.samples.length - 1, Math.max(0, Math.round((shift + s) / other.path.ds)));
          const o = locateOnPiece(other, p, around);
          if (o.s < 0 || o.s > other.path.length || Math.abs(o.u) > other.widthAt(o.s) / 2) continue;
          if (Math.abs(o.height) > Math.abs(worst)) {
            worst = o.height;
            worstAt = s;
          }
        }
      }
      if (Math.abs(worst) > FORK.maxStep) {
        problems.push(`${where} is ${(worst * 100).toFixed(1)} cm off the level of ${other.id} where they overlap (s ${worstAt.toFixed(1)}): make that bend flat`);
      }
    }

    // Junctions: wide enough, no holes.
    for (const [piece, s, what] of [
      [parent, branch.attach.s, 'leaves'],
      [target, branch.merge.s, 'rejoins'],
    ] as [BuiltPiece, number, string][]) {
      if (piece.widthAt(s) < FORK.minJunctionWidth) problems.push(`${where}: ${piece.id} is narrower than ${FORK.minJunctionWidth} m where it ${what}`);
      for (const h of piece.holes) {
        if (Math.abs(h.s - s) < FORK.junction + h.r) problems.push(`${where}: hole on ${piece.id} near where it ${what}`);
      }
    }
    for (const h of branch.holes) {
      if (h.s < FORK.junction + h.r || h.s > len - FORK.junction - h.r) problems.push(`${where}: hole at s ${h.s} near a junction`);
    }

    // The two ways are of similar length…
    if (parent === target) {
      const span = branch.merge.s - branch.attach.s;
      const ratio = len / span;
      if (ratio > FORK.maxLengthRatio || ratio < 1 / FORK.maxLengthRatio) {
        problems.push(`${where} is ${ratio.toFixed(2)}× as long as the way it bypasses (keep within ${FORK.maxLengthRatio}×)`);
      }
      // …and really separate.
      const mid = pathAt(branch.path, len / 2);
      const o = locateOnPiece(parent, mid.pos, Math.round((branch.attach.s + span / 2) / parent.path.ds), 30);
      const open = Math.abs(o.u) - (branch.widthAt(len / 2) + parent.widthAt(o.s)) / 2;
      if (open < FORK.minGap) problems.push(`${where} doesn't separate from ${parent.id} (${open.toFixed(1)} m apart at its middle, needs ${FORK.minGap})`);
    }
  }
  return problems;
}

import type { CoinSpot } from './coins';
import { pathAt } from './path';
import { segmentAt, type BuiltLevel, type BuiltPiece, type Hole, type PieceDef } from './level';
import type { Segment } from './path';
import type { Surface } from './surfaces';

/*
 * Drops (docs/level-design-guide.md §7.2): the ball rolls off the end of a piece (the lip)
 * and lands on a lower piece. The landing piece starts *under* the lip, so a ball of any
 * speed lands on it: nobody fails a drop. Built on track pieces (level.ts).
 */

export const DROP = {
  /** Height of the drop (lip surface to landing surface), meters. */
  minHeight: 1.5,
  maxHeight: 4,
  /** The landing starts at least this far back under the lip. */
  minOverlap: 0.5,
  /** The landing is at least this many times as wide as the lip. */
  landingWidthFactor: 1.5,
  /** Landing zone slope: flat or gently downhill. */
  maxLandingGrade: 0.06,
  /** The last meters before the lip: straight, hole-free, never climbing (the launch pad). */
  launchPad: 6,
  /** The landing may turn a little, no more (degrees). */
  maxTurn: 10,
};

/**
 * How long the landing zone must be (m, from the lip) for a drop of `height` m: the guide's
 * table (1.5 m → 10 m, 2.5 m → 12 m, 4 m → 14 m), in between linearly. It covers the
 * flight of a ball at top push speed plus room to settle.
 */
export function landingLength(height: number): number {
  const t: [number, number][] = [
    [1.5, 10],
    [2.5, 12],
    [4, 14],
  ];
  if (height <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (height <= t[i][0]) {
      const [h0, l0] = t[i - 1];
      const [h1, l1] = t[i];
      return l0 + ((l1 - l0) * (height - h0)) / (h1 - h0);
    }
  }
  return t[t.length - 1][1];
}

export interface DropOptions {
  /** The piece the ball drops from ('main' or an earlier piece). */
  from: string;
  /** Authored s of that piece's end: the lip. */
  lip: number;
  /** How far down (m). */
  height: number;
  /** How far back under the lip the landing starts (m). */
  overlap?: number;
}

export interface LandingPiece {
  segments: Segment[];
  width: [number, number][];
  grade?: number;
  holes?: Hole[];
  coins?: CoinSpot[];
  surfaces?: Surface[];
  finish?: boolean;
}

/** A landing piece for a drop off the end of `from` (see DropOptions). */
export function dropTo(id: string, drop: DropOptions, piece: LandingPiece): PieceDef {
  const overlap = drop.overlap ?? 1.5;
  return { id, from: { piece: drop.from, s: drop.lip - overlap, dy: -drop.height }, ...piece };
}

/** The piece's end point is a lip if nothing continues it there (no run-out). */
function isLipOf(parent: BuiltPiece, child: BuiltPiece): boolean {
  if (child.attach?.piece !== parent.id || parent.finishLine !== null) return false;
  return child.attach.s >= parent.path.length - 5;
}

/** Every drop rule a level breaks (empty when valid). A drop is a piece that starts at another piece's open end. */
export function dropProblems(level: BuiltLevel): string[] {
  const problems: string[] = [];
  const defs = new Map((level.def.pieces ?? []).map((p) => [p.id, p]));
  for (const child of level.pieces) {
    const parent = level.pieces.find((p) => p.id === child.attach?.piece);
    if (!parent || !isLipOf(parent, child)) continue;
    const def = defs.get(child.id)!;
    const where = `drop from ${parent.id} to ${child.id}`;
    const lipS = parent.path.length;
    // Measured where the landing hangs off the upper piece (what `height` in dropTo sets).
    const height = pathAt(parent.path, child.attach!.s).pos.y - child.path.samples[0].pos.y;
    const overlap = lipS - child.attach!.s;
    const launchWidth = parent.widthAt(lipS);

    if (height < DROP.minHeight - 1e-6 || height > DROP.maxHeight + 1e-6) {
      problems.push(`${where}: ${height.toFixed(1)} m high (${DROP.minHeight} to ${DROP.maxHeight})`);
    }
    if (overlap < DROP.minOverlap - 1e-6) problems.push(`${where}: the landing must start at least ${DROP.minOverlap} m under the lip`);
    if (Math.abs(def.from.turn ?? 0) > DROP.maxTurn) problems.push(`${where}: the landing turns more than ${DROP.maxTurn}°`);
    const sideways = Math.abs(def.from.u ?? 0);

    // The landing zone, from where the landing starts to `need` meters past the lip.
    const need = landingLength(height) + overlap;
    for (let s = 0; s <= need + 1e-9; s += 0.5) {
      const w = child.widthAt(s);
      if (w < launchWidth * DROP.landingWidthFactor - 1e-6 || sideways > (w - launchWidth) / 2 + 1e-6) {
        problems.push(`${where}: the landing is narrower than ${DROP.landingWidthFactor}× the lip (or off to the side) at s ${s.toFixed(1)}`);
        break;
      }
      const at = segmentAt(child, s);
      if (!at) {
        problems.push(`${where}: the landing zone is shorter than ${need.toFixed(1)} m`);
        break;
      }
      if (at.seg.kind !== 'straight' || at.grade < 0 || at.grade > DROP.maxLandingGrade) {
        problems.push(`${where}: the landing zone must be straight and gentle (0 to ${DROP.maxLandingGrade}) up to s ${need.toFixed(1)}`);
        break;
      }
    }
    for (const h of child.holes) {
      if (h.s - h.r < need) problems.push(`${where}: hole at s ${h.s} in the landing zone`);
    }

    // The launch pad: the last meters before the lip.
    const pad0 = parent.authoredLength - DROP.launchPad;
    for (let s = pad0 + 0.05; s <= parent.authoredLength + 1e-9; s += 0.5) {
      const at = segmentAt(parent, s);
      if (at && (at.seg.kind !== 'straight' || at.grade < 0)) {
        problems.push(`${where}: the last ${DROP.launchPad} m before the lip must be straight and not climbing`);
        break;
      }
    }
    for (const h of parent.holes) {
      if (h.s + h.r > pad0 + parent.offset) problems.push(`${where}: hole at s ${h.s - parent.offset} on the launch pad`);
    }
  }
  return problems;
}

/** Where the lips are (piece and absolute s of its end), for drawing the lip marker. */
export function lips(level: BuiltLevel): BuiltPiece[] {
  return level.pieces.filter((parent) => level.pieces.some((child) => isLipOf(parent, child)));
}

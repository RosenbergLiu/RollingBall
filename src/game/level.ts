import { Vector3 } from 'three';
import type { CoinSpot } from './coins';
import type { BuiltSurface, Surface } from './surfaces';
import { buildPath, pathAt, segmentLength, straight, type PathData, type Segment } from './path';
import { gateAt, type Gate } from './gates';
import { closestUnder, locateOnPiece } from './tracker';

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

/**
 * Where an extra track piece starts: a point on another piece (`s` along it, `u` across),
 * shifted up or down by `dy`, facing that piece's direction there turned by `turn` degrees.
 * `s` may run up to 10 m past the end of the other piece (it continues straight ahead).
 */
export interface PieceAttach {
  /** The piece it starts from: 'main' (the level's own route) or an earlier piece's id. */
  piece: string;
  /** Authored s on that piece. */
  s: number;
  /** Sideways offset (+ = right). */
  u?: number;
  /** Height offset in meters (negative = lower). */
  dy?: number;
  /** Heading change in degrees (+ = left). */
  turn?: number;
}

/**
 * An extra track piece: a ribbon built just like the main route (segments, width, holes,
 * coins, surfaces), placed relative to another piece. The foundation for drops (§7.2), real
 * forks (§7.1) and moving platforms (§7.7) in docs/level-design-guide.md.
 */
export interface PieceDef {
  /** Unique within the level; not 'main'. */
  id: string;
  from: PieceAttach;
  /** Default slope (default: the level's). */
  grade?: number;
  segments: Segment[];
  /** [s, width] keyframes, s from the piece's start. */
  width: [number, number][];
  holes?: Hole[];
  coins?: CoinSpot[];
  surfaces?: Surface[];
  /** This piece holds the finish line (and the run-out) instead of the main route. */
  finish?: boolean;
  /**
   * Where this piece's end rejoins another piece (a fork's branch merging back): that piece
   * and the authored s there. The end must line up with it (see forkProblems in forks.ts).
   */
  to?: { piece: string; s: number };
  /**
   * This piece ends in a lip above another piece (any id but its own): the ball drops onto
   * it. A way to rejoin a lower route without lining up exactly (see dropProblems in drops.ts).
   */
  dropOnto?: string;
  /** Checkpoint gates on this piece (authored s), e.g. after a fork's merge (see §7.10). */
  checkpoints?: number[];
}

/** A checkpoint gate: the piece it is on, its absolute s there, its route distance and its opening. */
export interface CheckpointRef {
  piece: BuiltPiece;
  s: number;
  route: number;
  gate: Gate;
}

/** The id of a level's own route (its `segments`, `width`, …). */
export const MAIN_PIECE = 'main';

export interface LevelDef {
  id: number;
  name: string;
  tagline: string;
  /** Default slope: drop per horizontal meter (0 = flat, negative = uphill). */
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
  /**
   * Checkpoint gates (s from the start of the authored segments), in order. Only for long
   * "adventure" levels; see checkpointProblems() and docs/level-design-guide.md §7.10.
   */
  checkpoints?: number[];
  /** Special surface tiles: boost arrows, music tiles (see src/game/surfaces.ts, guide §7.3). */
  surfaces?: Surface[];
  /** Extra track pieces (see PieceDef). Without them the level is one continuous ribbon. */
  pieces?: PieceDef[];
  theme: Theme;
}

/** Flat pad the ball spawns on. */
export const ENTRANCE_LENGTH = 7;
/** Flat area after the finish line where the ball brakes. */
export const RUNOUT_LENGTH = 12;
export const SPAWN_S = 3;
export const BALL_RADIUS = 0.5;
/** Steepest allowed slope, up or down (drop or rise per horizontal meter). */
export const MAX_GRADE = 0.2;
/** Largest slope change between neighbouring segments; keeps crests and dips smooth. */
export const MAX_GRADE_CHANGE = 0.2;
/**
 * The route may not climb in its first meters: a ball that fails to make it up would roll
 * back across the start pad and off its open back edge.
 */
export const NO_CLIMB_START = 12;

/**
 * Every slope rule a level breaks (empty when valid). Routes may go down, run flat or
 * climb, as long as no slope is too steep and slope changes are smooth.
 */
export function slopeProblems(def: LevelDef): string[] {
  const finishPiece = def.pieces?.find((p) => p.finish)?.id ?? MAIN_PIECE;
  const problems = segmentSlopeProblems(def.segments, def.grade, '', finishPiece === MAIN_PIECE, true);
  for (const piece of def.pieces ?? []) {
    problems.push(...segmentSlopeProblems(piece.segments, piece.grade ?? def.grade, `piece ${piece.id}: `, piece.finish === true, false));
  }
  return problems;
}

function segmentSlopeProblems(segments: Segment[], grade: number, label: string, runout: boolean, entrance: boolean): string[] {
  const problems: string[] = [];
  const near = (a: number, b: number) => a <= b + 1e-9;
  let s = 0;
  // The main route starts on the flat entrance pad; other pieces start with their own slope.
  let prev = entrance ? 0 : (segments[0]?.grade ?? grade);
  segments.forEach((seg, i) => {
    const g = seg.grade ?? grade;
    const where = `${label}segment ${i} (s ${s.toFixed(1)}, grade ${g})`;
    if (!near(Math.abs(g), MAX_GRADE)) problems.push(`${where} is steeper than ${MAX_GRADE}`);
    if (!near(Math.abs(g - prev), MAX_GRADE_CHANGE)) problems.push(`${where} changes slope too sharply from ${prev}`);
    if (entrance && g < 0 && s < NO_CLIMB_START) problems.push(`${where} climbs within the first ${NO_CLIMB_START} m`);
    prev = g;
    s += segmentLength(seg);
  });
  if (runout && !near(Math.abs(prev), MAX_GRADE_CHANGE)) problems.push(`${label}the last segment changes slope too sharply into the flat run-out`);
  return problems;
}

/** The baseline is this far under the level's lowest platform: only falling below it is Game Over. */
export const BASELINE_DEPTH = 3;

export interface BuiltHole extends Hole {
  /** Arc-length scale at the hole's lateral offset (keeps holes round on curves). */
  m: number;
}

/** One track piece, built: a ribbon in world space with everything on it. */
export interface BuiltPiece {
  id: string;
  path: PathData;
  /** Absolute s = authored s + offset (the main route starts with the entrance pad). */
  offset: number;
  /** The authored segments and default slope (for the design rules). */
  segments: Segment[];
  grade: number;
  /** Length of the authored segments (no entrance pad, no run-out). */
  authoredLength: number;
  /** Holes with absolute s. */
  holes: BuiltHole[];
  /** Coin spots with absolute s. */
  coinSpots: CoinSpot[];
  /** Surface tiles with absolute s, sorted by s0. */
  surfaces: BuiltSurface[];
  maxWidth: number;
  minY: number;
  widthAt(s: number): number;
  /** Route distance at this piece's s = 0 (the progress bar counts route distance). */
  routeStart: number;
  /** Absolute s of the finish line on the piece that has it; null on the others. */
  finishLine: number | null;
  /** The piece this one starts from and the absolute s there (null for the main route). */
  attach: { piece: string; s: number } | null;
  /** The piece this one's end rejoins and the absolute s there (null: it doesn't merge). */
  merge: { piece: string; s: number } | null;
  /** The piece this one's lip drops onto and the absolute s under the lip there (null: none). */
  dropOnto: { piece: string; s: number } | null;
}

/**
 * A built level. It is its main piece (so single-ribbon code can use `level.path` etc.)
 * plus every piece, the finish, the checkpoints and the spawn point.
 */
export interface BuiltLevel extends BuiltPiece {
  def: LevelDef;
  /** Every piece, the main route first (`pieces[0] === level`). */
  pieces: BuiltPiece[];
  /** The piece with the finish line, and the line's absolute s on it. */
  finish: BuiltPiece;
  finishS: number;
  /** The finish gate's opening: the ball must go through it to win. */
  finishGate: Gate;
  /** Height under which the ball has fallen (Game Over). */
  baseline: number;
  /** Route distance of the finish line. */
  routeLength: number;
  /** Checkpoint gates on any piece, in route order. */
  checkpoints: CheckpointRef[];
  spawnS: number;
}

export function holeDistance(h: BuiltHole, s: number, u: number): number {
  return Math.hypot((s - h.s) * h.m, u - h.u);
}

/** The farthest an extra piece may start past the end of the piece it starts from. */
const ATTACH_OVERRUN = 10;

function widthFn(width: [number, number][], offset: number): (s: number) => number {
  const keys = [...width].sort((a, b) => a[0] - b[0]).map(([s, w]) => [s + offset, w] as [number, number]);
  return (s: number): number => {
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
}

interface PieceSource {
  id: string;
  segments: Segment[];
  grade: number;
  width: [number, number][];
  holes?: Hole[];
  coins?: CoinSpot[];
  surfaces?: Surface[];
  entrance: boolean;
  runout: boolean;
}

/** Moves a path built at the origin (heading -Z) to start at `origin`, facing `heading`. */
function placePath(path: PathData, origin: Vector3, heading: number): void {
  const c = Math.cos(heading);
  const sn = Math.sin(heading);
  const rot = (v: Vector3) => v.set(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c);
  for (const smp of path.samples) {
    rot(smp.pos).add(origin);
    rot(smp.tan);
    rot(smp.right);
    rot(smp.normal);
  }
}

/** The start point and heading of a piece attached to `parent` (see PieceAttach). */
export function attachFrame(parent: BuiltPiece, a: PieceAttach): { pos: Vector3; heading: number } {
  const sAbs = a.s + parent.offset;
  const len = parent.path.length;
  const f = pathAt(parent.path, Math.min(Math.max(sAbs, 0), len));
  const flat = new Vector3(f.tan.x, 0, f.tan.z).normalize();
  const pos = f.pos.clone();
  if (sAbs > len) pos.addScaledVector(flat, sAbs - len);
  pos.addScaledVector(f.right, a.u ?? 0);
  pos.y += a.dy ?? 0;
  return { pos, heading: Math.atan2(-flat.x, -flat.z) + ((a.turn ?? 0) * Math.PI) / 180 };
}

function buildPiece(
  src: PieceSource,
  origin: Vector3 | null,
  heading: number,
  routeStart: number,
  attach: { piece: string; s: number } | null,
  merge: { piece: string; s: number } | null = null,
): BuiltPiece {
  const offset = src.entrance ? ENTRANCE_LENGTH : 0;
  const segs = [
    ...(src.entrance ? [straight(ENTRANCE_LENGTH, 0)] : []),
    ...src.segments,
    ...(src.runout ? [straight(RUNOUT_LENGTH, 0)] : []),
  ];
  const path = buildPath(segs, src.grade);
  if (origin) placePath(path, origin, heading);
  const widthAt = widthFn(src.width, offset);
  let maxWidth = 0;
  let minY = Infinity;
  path.samples.forEach((smp, i) => {
    maxWidth = Math.max(maxWidth, widthAt(i * path.ds));
    minY = Math.min(minY, smp.pos.y);
  });
  const holes: BuiltHole[] = (src.holes ?? []).map((h) => {
    const s = h.s + offset;
    const k = pathAt(path, s).curvature;
    const m = Math.min(2.5, Math.max(0.4, 1 + k * h.u));
    return { s, u: h.u, r: h.r, m };
  });
  return {
    id: src.id,
    path,
    offset,
    segments: src.segments,
    grade: src.grade,
    authoredLength: src.segments.reduce((sum, seg) => sum + segmentLength(seg), 0),
    holes,
    coinSpots: (src.coins ?? []).map((c) => ({ s: c.s + offset, u: c.u })),
    surfaces: (src.surfaces ?? [])
      .map((x) => ({ type: x.type, s0: x.s0 + offset, s1: x.s1 + offset, u0: x.u0, u1: x.u1, note: x.note ?? 0, index: 0 }))
      .sort((a, b) => a.s0 - b.s0)
      .map((x, index) => ({ ...x, index })),
    maxWidth,
    minY,
    widthAt,
    routeStart,
    finishLine: src.runout ? path.length - RUNOUT_LENGTH + 1.5 : null,
    attach,
    merge,
    dropOnto: null,
  };
}

export function buildLevel(def: LevelDef): BuiltLevel {
  const extra = def.pieces ?? [];
  const finishId = extra.find((p) => p.finish)?.id ?? MAIN_PIECE;
  const main = buildPiece(
    { ...def, id: MAIN_PIECE, entrance: true, runout: finishId === MAIN_PIECE },
    null,
    0,
    0,
    null,
  );
  const pieces: BuiltPiece[] = [main];
  for (const p of extra) {
    const parent = pieces.find((q) => q.id === p.from.piece);
    if (!parent || p.id === MAIN_PIECE || pieces.some((q) => q.id === p.id)) {
      console.warn(`Level ${def.id}: skipping piece "${p.id}" (bad id or unknown parent "${p.from.piece}")`);
      continue;
    }
    const sAbs = Math.min(p.from.s + parent.offset, parent.path.length + ATTACH_OVERRUN);
    const { pos, heading } = attachFrame(parent, p.from);
    pieces.push(
      buildPiece(
        { ...p, grade: p.grade ?? def.grade, entrance: false, runout: p.id === finishId },
        pos,
        heading,
        parent.routeStart + sAbs,
        { piece: parent.id, s: sAbs },
        mergeRef(pieces, p),
      ),
    );
  }
  // Lips that drop onto another piece: where on it the ball lands (right under the lip).
  for (const p of extra) {
    if (!p.dropOnto) continue;
    const piece = pieces.find((q) => q.id === p.id);
    const target = pieces.find((q) => q.id === p.dropOnto && q !== piece);
    if (!piece || !target) continue;
    const lip = piece.path.samples[piece.path.samples.length - 1].pos;
    const start = closestUnder(target, lip);
    if (start >= 0) piece.dropOnto = { piece: target.id, s: locateOnPiece(target, lip, start).s };
  }
  const finish = pieces.find((q) => q.finishLine !== null) ?? main;
  const finishS = finish.finishLine ?? finish.path.length;
  const level = main as BuiltLevel;
  level.def = def;
  level.pieces = pieces;
  level.finish = finish;
  level.finishS = finishS;
  level.finishGate = gateAt(finish, finishS, 'finish');
  level.routeLength = finish.routeStart + finishS;
  const checkpoint = (piece: BuiltPiece, s: number, route: number): CheckpointRef => ({ piece, s, route, gate: gateAt(piece, s, 'checkpoint') });
  level.checkpoints = [
    ...(def.checkpoints ?? []).map((s) => checkpoint(main, s + ENTRANCE_LENGTH, s + ENTRANCE_LENGTH)),
    ...extra.flatMap((d) => {
      const piece = pieces.find((q) => q.id === d.id);
      return piece ? (d.checkpoints ?? []).map((s) => checkpoint(piece, s, piece.routeStart + s)) : [];
    }),
  ].sort((a, b) => a.route - b.route);
  level.spawnS = SPAWN_S;
  level.minY = Math.min(...pieces.map((q) => q.minY));
  level.baseline = level.minY - BASELINE_DEPTH;
  return level;
}

/** A piece's `to` as an absolute s on an already built piece (null if none or unknown). */
function mergeRef(built: BuiltPiece[], p: PieceDef): { piece: string; s: number } | null {
  if (!p.to) return null;
  const target = built.find((q) => q.id === p.to!.piece);
  return target ? { piece: target.id, s: p.to.s + target.offset } : null;
}

/**
 * Every rule about extra pieces a level breaks (empty when valid): ids, what each starts
 * from, where, and which piece has the finish.
 */
export function pieceProblems(def: LevelDef): string[] {
  const problems: string[] = [];
  const known = new Map<string, number>([[MAIN_PIECE, def.segments.reduce((sum, seg) => sum + segmentLength(seg), 0)]]);
  const finishes = (def.pieces ?? []).filter((p) => p.finish).length;
  if (finishes > 1) problems.push(`${finishes} pieces have the finish (at most one)`);
  for (const p of def.pieces ?? []) {
    const where = `piece "${p.id}"`;
    if (p.id === MAIN_PIECE || known.has(p.id)) problems.push(`${where}: the id is already used`);
    const parentLength = known.get(p.from.piece);
    if (parentLength === undefined) problems.push(`${where} starts from "${p.from.piece}", which is not 'main' or an earlier piece`);
    else if (p.from.s < 0 || p.from.s > parentLength + ATTACH_OVERRUN) {
      problems.push(`${where} starts at s ${p.from.s}, outside "${p.from.piece}" (0 to ${(parentLength + ATTACH_OVERRUN).toFixed(1)})`);
    }
    if (p.to) {
      const targetLength = known.get(p.to.piece);
      if (targetLength === undefined) problems.push(`${where} merges into "${p.to.piece}", which is not 'main' or an earlier piece`);
      else if (p.to.s < 0 || p.to.s > targetLength) problems.push(`${where} merges at s ${p.to.s}, outside "${p.to.piece}"`);
      if (p.to.piece === p.from.piece && p.to.s <= p.from.s) problems.push(`${where} merges back before where it starts`);
      if (p.finish) problems.push(`${where} both merges and has the finish`);
    }
    if (p.dropOnto !== undefined) {
      const ids = new Set([MAIN_PIECE, ...(def.pieces ?? []).map((q) => q.id)]);
      if (!ids.has(p.dropOnto) || p.dropOnto === p.id) problems.push(`${where} drops onto "${p.dropOnto}", which is not another piece`);
      if (p.to || p.finish) problems.push(`${where} drops onto another piece, so it can't also merge or have the finish`);
    }
    if (p.segments.length === 0) problems.push(`${where} has no segments`);
    if (p.width.length === 0) problems.push(`${where} has no width`);
    if (!known.has(p.id)) known.set(p.id, p.segments.reduce((sum, seg) => sum + segmentLength(seg), 0));
  }
  return problems;
}

/** Where the track passes over itself (or one piece over another), the surfaces are at least this far apart. */
export const MIN_OVERPASS_GAP = 8;
/**
 * Around the point where a piece starts from another (a drop's landing under its lip, a fork)
 * and where it merges back, the two may overlap on purpose: drops and forks check those
 * junctions with their own rules.
 */
const JOIN_ZONE = 15;

/**
 * Every place where two parts of the track overlap seen from above with less than
 * MIN_OVERPASS_GAP between their surfaces (empty when valid). Parts of one piece less
 * than 20 m apart along it are neighbours, not an overpass; a piece and the one it starts
 * from may overlap near the start point.
 */
export function overlapProblems(level: BuiltLevel): string[] {
  const problems: string[] = [];
  interface Pt {
    piece: BuiltPiece;
    s: number;
    pos: Vector3;
    w: number;
    tx: number;
    tz: number;
    rx: number;
    rz: number;
  }
  const pts: Pt[] = [];
  for (const piece of level.pieces) {
    const { samples, ds } = piece.path;
    const every = Math.max(1, Math.round(1 / ds));
    for (let k = 0; k < samples.length; k += every) {
      const smp = samples[k];
      const th = Math.hypot(smp.tan.x, smp.tan.z) || 1;
      pts.push({ piece, s: k * ds, pos: smp.pos, w: piece.widthAt(k * ds), tx: smp.tan.x / th, tz: smp.tan.z / th, rx: smp.right.x, rz: smp.right.z });
    }
  }
  /** Does the cross-section of the track at `a` (center and both edges) lie over the surface around `b`? */
  const over = (a: Pt, b: Pt) => {
    for (const k of [-1, 0, 1]) {
      const dx = a.pos.x + a.rx * (k * a.w) / 2 - b.pos.x;
      const dz = a.pos.z + a.rz * (k * a.w) / 2 - b.pos.z;
      if (Math.abs(dx * b.tx + dz * b.tz) <= 0.6 && Math.abs(dx * b.rx + dz * b.rz) <= b.w / 2) return true;
    }
    return false;
  };
  const nearStart = (child: BuiltPiece, cs: number, parent: BuiltPiece, ps: number) =>
    (child.attach?.piece === parent.id && cs < JOIN_ZONE && Math.abs(ps - child.attach.s) < JOIN_ZONE) ||
    (child.merge?.piece === parent.id && cs > child.path.length - JOIN_ZONE && Math.abs(ps - child.merge.s) < JOIN_ZONE) ||
    (child.dropOnto?.piece === parent.id && cs > child.path.length - JOIN_ZONE && Math.abs(ps - child.dropOnto.s) < JOIN_ZONE);
  const seen = new Set<string>();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i];
      const b = pts[j];
      if (a.piece === b.piece) {
        if (Math.abs(a.s - b.s) < 20) continue;
      } else if (nearStart(a.piece, a.s, b.piece, b.s) || nearStart(b.piece, b.s, a.piece, a.s)) {
        continue;
      }
      const gap = Math.abs(a.pos.y - b.pos.y);
      if (gap >= MIN_OVERPASS_GAP || !(over(a, b) || over(b, a))) continue;
      const key = `${a.piece.id}@${Math.round(a.s / 5)}/${b.piece.id}@${Math.round(b.s / 5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(`${a.piece.id} s ${a.s.toFixed(0)} and ${b.piece.id} s ${b.s.toFixed(0)} overlap only ${gap.toFixed(1)} m apart`);
    }
  }
  return problems;
}

/** Where the ball is placed at rest: on the centerline of `piece` at absolute `s`. */
export function spawnPoint(piece: BuiltPiece, s: number): Vector3 {
  const f = pathAt(piece.path, s);
  return f.pos.addScaledVector(f.normal, BALL_RADIUS + 0.01);
}

/** Placement rules for checkpoint gates (also documented in docs/level-design-guide.md §7.10). */
export const CHECKPOINT_RULES = {
  /** At most this many gates per level… */
  max: 3,
  /** …at least this far apart, and this far from the start of the route. */
  minGap: 25,
  /** The last gate is at least this far before the finish line, so it's worth having. */
  minToFinish: 20,
  /** The gate sits on a rest area: straight, gentle and wide from this far before it… */
  restBefore: 6,
  /** …to this far after it (straight and gentle up to restBefore after it). */
  restAfter: 8,
  minWidth: 6,
  /** Downhill at most this steep, and never uphill (a ball respawned at rest would roll back). */
  maxGrade: 0.06,
};

/** The authored segment of a piece at authored distance `s`, with its grade. */
export function segmentAt(piece: BuiltPiece, s: number): { seg: Segment; grade: number } | null {
  let start = 0;
  for (const seg of piece.segments) {
    const end = start + segmentLength(seg);
    if (s >= start && s <= end) return { seg, grade: seg.grade ?? piece.grade };
    start = end;
  }
  return null;
}

/**
 * Every checkpoint rule a level breaks (empty when valid). A respawned ball must start
 * somewhere calm, never facing a hazard: on a straight, gentle, wide, hole-free rest area.
 */
export function checkpointProblems(level: BuiltLevel): string[] {
  const R = CHECKPOINT_RULES;
  const cps = level.checkpoints;
  const problems: string[] = [];
  if (cps.length > R.max) problems.push(`${cps.length} checkpoints (at most ${R.max})`);
  cps.forEach((cp, i) => {
    const { piece } = cp;
    const s = cp.s - piece.offset;
    const where = `checkpoint ${i} (${piece.id === MAIN_PIECE ? '' : `piece ${piece.id} `}s ${s})`;
    const prev = i === 0 ? ENTRANCE_LENGTH : cps[i - 1].route;
    if (cp.route - prev < R.minGap) problems.push(`${where} is less than ${R.minGap} m after ${i === 0 ? 'the start' : `checkpoint ${i - 1}`}`);
    if (level.routeLength - cp.route < R.minToFinish) problems.push(`${where} is less than ${R.minToFinish} m before the finish line`);
    if (s + R.restAfter > piece.authoredLength) problems.push(`${where} is too close to the end of its piece`);
    // Every player meets it: never on a way that rejoins another (a fork's branch, a high road).
    if (piece.merge || piece.dropOnto) problems.push(`${where} is on a branch; put it before the fork or after the ways meet`);
    for (let x = s - R.restBefore; x <= s + R.restAfter + 1e-9; x += 0.5) {
      if (piece.widthAt(x + piece.offset) < R.minWidth) {
        problems.push(`${where}: narrower than ${R.minWidth} m at s ${x.toFixed(1)}`);
        break;
      }
    }
    for (let x = s - R.restBefore; x <= s + R.restBefore + 1e-9; x += 0.5) {
      const at = segmentAt(piece, x);
      if (!at) continue;
      if (at.seg.kind !== 'straight') {
        problems.push(`${where}: not on a straight at s ${x.toFixed(1)}`);
        break;
      }
      if (at.grade < 0 || at.grade > R.maxGrade) {
        problems.push(`${where}: grade ${at.grade} at s ${x.toFixed(1)} (needs 0 to ${R.maxGrade})`);
        break;
      }
    }
    for (const h of piece.holes) {
      const hs = h.s - piece.offset;
      if (hs + h.r > s - R.restBefore && hs - h.r < s + R.restAfter) problems.push(`${where}: hole at s ${hs} is too close`);
    }
  });
  return problems;
}

/** Minimal view of the path tracker needed by the rules. */
export interface TrackState {
  /** The piece the ball is on (or last left). s, u and height are relative to it. */
  piece: BuiltPiece;
  s: number;
  u: number;
  height: number;
}

/**
 * Fallen (Game Over): the ball's center is under the baseline. Above it the ball may still
 * land on any platform below it.
 */
export function hasFallen(level: BuiltLevel, y: number): boolean {
  return y < level.baseline;
}

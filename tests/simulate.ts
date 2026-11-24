import { Autopilot } from '../src/game/autopilot';
import { buildLevel, hasFallen, hasFinished, spawnPoint, type LevelDef } from '../src/game/level';
import { PhysicsWorld, PHYSICS, type Vec3 } from '../src/game/physics';
import { buildPlatform, levelColliders } from '../src/game/platform';
import { applySurfaces, SurfaceContact } from '../src/game/surfaces';
import { PathTracker } from '../src/game/tracker';

export interface SimResult {
  outcome: 'won' | 'fell' | 'timeout';
  time: number;
  s: number;
  finishS: number;
  maxSpeed: number;
  /** Music tile notes the ball rolled onto, in order. */
  notes: number[];
  /** How many times the ball rolled onto boost arrows. */
  boosts: number;
  /** The piece the ball ended on, and every piece it was on, in order. */
  piece: string;
  pieces: string[];
}

export type Controller = (ctx: { tracker: PathTracker; pos: Vec3; vel: Vec3; out: Vec3; t: number }) => void;

/**
 * Runs a level headlessly with the real physics and rules. Defaults to the autopilot.
 * `startS` (absolute s, on `startPiece`, default main) starts the ball at rest there instead
 * of the entrance, e.g. at a checkpoint.
 * `route` lists fork branches the autopilot takes.
 */
export function simulate(
  def: LevelDef,
  opts: { maxTime?: number; controller?: Controller; startS?: number; startPiece?: string; route?: string[] } = {},
): SimResult {
  const level = buildLevel(def);
  const platforms = level.pieces.map((piece) => buildPlatform(piece));
  const physics = new PhysicsWorld();
  const colliders = levelColliders(level, platforms);
  physics.setPlatform(colliders.top, colliders.walls);
  const tracker = new PathTracker(level);
  const pilot = new Autopilot(level);
  for (const id of opts.route ?? []) pilot.route.add(id);
  const startS = opts.startS ?? level.spawnS;
  const startPiece = level.pieces.find((p) => p.id === opts.startPiece) ?? level;
  physics.placeBall(spawnPoint(startPiece, startS));
  tracker.reset(startS, startPiece);
  const accel: Vec3 = { x: 0, y: 0, z: 0 };
  const maxTime = opts.maxTime ?? 120;
  let maxSpeed = 0;
  const contact = new SurfaceContact();
  const notes: number[] = [];
  let boosts = 0;
  const visited: string[] = [];
  let outcome: SimResult['outcome'] = 'timeout';
  let t = 0;
  try {
    for (; t < maxTime; t += PHYSICS.dt) {
      const pos = physics.ball.translation();
      const vel = physics.ball.linvel();
      if (opts.controller) opts.controller({ tracker, pos, vel, out: accel, t });
      else pilot.compute(tracker, pos, vel, accel);
      const entered = applySurfaces(tracker, contact, accel);
      if (entered?.type === 'music') notes.push(entered.note);
      if (entered?.type === 'boost') boosts++;
      physics.setAcceleration(accel);
      physics.step();
      const p = physics.ball.translation();
      const v = physics.ball.linvel();
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z));
      tracker.update(p);
      if (visited[visited.length - 1] !== tracker.piece.id) visited.push(tracker.piece.id);
      if (hasFallen(level, tracker, p.y)) {
        outcome = 'fell';
        break;
      }
      if (hasFinished(level, tracker)) {
        outcome = 'won';
        break;
      }
    }
    return { outcome, time: t, s: tracker.s, finishS: level.finishS, maxSpeed, notes, boosts, piece: tracker.piece.id, pieces: visited };
  } finally {
    physics.dispose();
  }
}

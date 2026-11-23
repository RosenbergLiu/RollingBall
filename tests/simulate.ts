import { Autopilot } from '../src/game/autopilot';
import { buildLevel, hasFallen, hasFinished, spawnPoint, type LevelDef } from '../src/game/level';
import { PhysicsWorld, PHYSICS, type Vec3 } from '../src/game/physics';
import { buildPlatform } from '../src/game/platform';
import { PathTracker } from '../src/game/tracker';

export interface SimResult {
  outcome: 'won' | 'fell' | 'timeout';
  time: number;
  s: number;
  finishS: number;
  maxSpeed: number;
}

export type Controller = (ctx: { tracker: PathTracker; pos: Vec3; vel: Vec3; out: Vec3; t: number }) => void;

/** Runs a level headlessly with the real physics and rules. Defaults to the autopilot. */
export function simulate(def: LevelDef, opts: { maxTime?: number; controller?: Controller } = {}): SimResult {
  const level = buildLevel(def);
  const platform = buildPlatform(level);
  const physics = new PhysicsWorld();
  physics.setPlatform(platform.topCollider, platform.wallCollider);
  const tracker = new PathTracker(level);
  const pilot = new Autopilot(level);
  physics.placeBall(spawnPoint(level));
  tracker.reset(level.spawnS);
  const accel: Vec3 = { x: 0, y: 0, z: 0 };
  const maxTime = opts.maxTime ?? 120;
  let maxSpeed = 0;
  let outcome: SimResult['outcome'] = 'timeout';
  let t = 0;
  try {
    for (; t < maxTime; t += PHYSICS.dt) {
      const pos = physics.ball.translation();
      const vel = physics.ball.linvel();
      if (opts.controller) opts.controller({ tracker, pos, vel, out: accel, t });
      else pilot.compute(tracker, pos, vel, accel);
      physics.setAcceleration(accel);
      physics.step();
      const p = physics.ball.translation();
      const v = physics.ball.linvel();
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z));
      tracker.update(p);
      if (hasFallen(level, tracker, p.y)) {
        outcome = 'fell';
        break;
      }
      if (hasFinished(level, tracker)) {
        outcome = 'won';
        break;
      }
    }
    return { outcome, time: t, s: tracker.s, finishS: level.finishS, maxSpeed };
  } finally {
    physics.dispose();
  }
}

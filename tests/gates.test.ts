import { beforeAll, describe, expect, it } from 'vitest';
import { CHECKPOINT_GATE, FINISH_GATE, gateAt, hasFinished, passedCheckpoint, throughGate } from '../src/game/gates';
import { BASELINE_DEPTH, buildLevel, hasFallen, spawnPoint, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { pathAt, straight } from '../src/game/path';
import { initPhysics } from '../src/game/physics';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

const level = buildLevel(LEVELS[0]);

/** A point `u` across the main route at `s` and `h` meters straight above its surface there. */
function at(s: number, u = 0, h = 0.5) {
  const f = pathAt(level.path, s);
  return f.pos.clone().addScaledVector(f.right, u).add({ x: 0, y: h, z: 0 } as never);
}

/** Does any step of a move through these points go through the gate? */
function anyThrough(points: ReturnType<typeof at>[], g: ReturnType<typeof gateAt>): boolean {
  return points.some((p, i) => i > 0 && throughGate(g, points[i - 1], p));
}

describe('gates', () => {
  const g = gateAt(level, 20, 'checkpoint');

  it('count a ball rolling through', () => {
    expect(throughGate(g, at(19.8), at(20.2))).toBe(true);
  });

  it('count a ball flying through under the bar', () => {
    expect(throughGate(g, at(19.9, 0, 2.2), at(20.1, 0, 2.1))).toBe(true);
  });

  it('do not count going over the top', () => {
    expect(throughGate(g, at(19.9, 0, CHECKPOINT_GATE.top + 0.3), at(20.1, 0, CHECKPOINT_GATE.top + 0.2))).toBe(false);
  });

  it('do not count passing outside the posts', () => {
    const u = level.widthAt(20) / 2 + CHECKPOINT_GATE.post + 0.3;
    expect(throughGate(g, at(19.8, u), at(20.2, u))).toBe(false);
    expect(throughGate(g, at(19.8, -u), at(20.2, -u))).toBe(false);
  });

  it('do not count going backwards', () => {
    expect(throughGate(g, at(20.2), at(19.8))).toBe(false);
  });

  it('do not count jumping over the gate and landing past it', () => {
    // A 10 m hop peaking 5 m up, in small steps like the physics takes.
    const arc = Array.from({ length: 101 }, (_, i) => {
      const x = i / 100;
      return at(15 + 10 * x, 0, 0.5 + 18 * x * (1 - x));
    });
    expect(anyThrough(arc, g)).toBe(false);
  });

  it('activate the furthest checkpoint passed and never go back', () => {
    const cps = [10, 20, 30].map((s) => ({ piece: level, s, route: s, gate: gateAt(level, s, 'checkpoint') }));
    expect(passedCheckpoint(cps, at(5), at(5.2), -1)).toBe(-1);
    expect(passedCheckpoint(cps, at(9.9), at(10.1), -1)).toBe(0);
    expect(passedCheckpoint(cps, at(29.9), at(30.1), 0)).toBe(2); // skipped gate 1: the furthest one counts
    expect(passedCheckpoint(cps, at(9.9), at(10.1), 2)).toBe(2); // back through an earlier gate
    expect(passedCheckpoint(cps, at(20.1), at(19.9), 2)).toBe(2); // backwards
    expect(passedCheckpoint(cps, spawnPoint(level, 20), at(20.3), 1)).toBe(1); // respawned on gate 1
    expect(passedCheckpoint([], at(9.9), at(10.1), -1)).toBe(-1);
  });

  it('win only through the finish gate', () => {
    const f = level.finishS;
    expect(hasFinished(level, at(f - 0.2), at(f + 0.2))).toBe(true);
    expect(hasFinished(level, at(f - 0.1, 0, 2.6), at(f + 0.1, 0, 2.5))).toBe(true); // flying through
    expect(hasFinished(level, at(f - 0.1, 0, FINISH_GATE.top + 0.3), at(f + 0.1, 0, FINISH_GATE.top + 0.2))).toBe(false); // over the banner
    expect(hasFinished(level, at(f + 1, 0, 1), at(f + 1.2, 0, 0.5))).toBe(false); // landing past the line
    expect(hasFinished(level, at(f + 0.2), at(f - 0.2))).toBe(false); // backwards
  });
});

describe('baseline', () => {
  it('is 3 m under the lowest platform, and only below it is a fall', () => {
    expect(BASELINE_DEPTH).toBe(3);
    expect(level.baseline).toBeCloseTo(level.minY - 3, 6);
    expect(hasFallen(level, level.baseline + 0.01)).toBe(false);
    expect(hasFallen(level, level.baseline - 0.01)).toBe(true);
  });

  it('a ball pushed off the route lands on a platform 10 m below and keeps playing', () => {
    // The main route over a wide platform 10 m under it that isn't part of the route.
    const stacked: LevelDef = {
      ...LEVELS[0],
      id: 99,
      segments: [straight(40, 0.04)],
      width: [[0, 6]],
      checkpoints: [],
      coins: [],
      pieces: [{ id: 'under', from: { piece: 'main', s: 0, dy: -10 }, segments: [straight(40, 0.04)], width: [[0, 30]] }],
    };
    const r = simulate(stacked, {
      maxTime: 8,
      controller: ({ tracker, vel, out }) => {
        out.y = 0;
        if (tracker.piece.id === 'main' && tracker.s > 15) {
          out.x = 20; // off the right edge
          out.z = 0;
        } else {
          out.x = -vel.x * 2;
          out.z = (-4 - vel.z) * 3;
        }
      },
    });
    expect(r.outcome).toBe('timeout');
    expect(r.pieces).toEqual(['main', 'under']);
  });
});

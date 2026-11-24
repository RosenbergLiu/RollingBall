import { beforeAll, describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import {
  buildLevel,
  checkpointProblems,
  holeDistance,
  MAX_GRADE,
  overlapProblems,
  passedCheckpoint,
  pieceProblems,
  slopeProblems,
  type LevelDef,
} from '../src/game/level';
import { right, straight } from '../src/game/path';
import { LEVELS } from '../src/game/levels';
import { initPhysics, PHYSICS } from '../src/game/physics';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

describe('level catalog', () => {
  it('has unique, sequential ids starting at 1', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(LEVELS.map((_, i) => i + 1));
  });

  it('gives every level a different shape', () => {
    const shapes = LEVELS.map((l) => JSON.stringify([l.segments, l.width, l.holes ?? [], l.pieces ?? []]));
    expect(new Set(shapes).size).toBe(LEVELS.length);
  });

  it('keeps at least 8 m between the surfaces wherever the track passes over itself', () => {
    for (const def of LEVELS) expect(overlapProblems(buildLevel(def)), def.name).toEqual([]);
  });

  it('uses only valid extra track pieces', () => {
    for (const def of LEVELS) expect(pieceProblems(def), def.name).toEqual([]);
  });

  it('keeps every hole inside the authored part of its piece', () => {
    for (const def of LEVELS) {
      const level = buildLevel(def);
      for (const piece of level.pieces) {
        for (const h of piece.holes) {
          expect(h.s - h.r).toBeGreaterThan(piece === level ? level.spawnS + 3 : 0);
          expect(h.s + h.r).toBeLessThan((piece.finishLine ?? piece.path.length) - 1);
        }
      }
    }
  });
});

describe.each(LEVELS)('level $id: $name', (def) => {
  it('can be completed without falling', () => {
    const r = simulate(def);
    expect(r, `reached s=${r.s.toFixed(1)} of ${r.finishS.toFixed(1)}`).toMatchObject({ outcome: 'won' });
  });
});

describe.each(LEVELS)('smooth rolling on level $id: $name', (def) => {
  // Driven fast, every physics step must move the ball as far as its velocity says (no
  // stop-start stutter, which shows on screen as a shake that grows with speed) and the ball
  // must stay on the surface (no hops off triangle seams).
  it('moves steadily and stays on the surface at speed', () => {
    const level = buildLevel(def);
    const pilot = new Autopilot(level);
    pilot.cruiseSpeed = 14;
    let prev: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null = null;
    const stutters: string[] = [];
    let worstLift = 0;
    const r = simulate(def, {
      controller: ({ tracker, pos, vel, out }) => {
        if (prev) {
          const moved = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z);
          const expected = (Math.hypot(vel.x + prev.vx, vel.y + prev.vy, vel.z + prev.vz) / 2) * PHYSICS.dt;
          if (expected > 4 * PHYSICS.dt && Math.abs(moved / expected - 1) > 0.1) {
            stutters.push(`s ${tracker.s.toFixed(1)}: moved ${moved.toFixed(3)} m, expected ${expected.toFixed(3)} m`);
          }
          // Skimming a hole's rim legitimately dips the ball, so only judge it on solid ground.
          const overRim = level.holes.some((h) => holeDistance(h, tracker.s, tracker.u) < h.r + PHYSICS.ballRadius);
          if (!overRim) worstLift = Math.max(worstLift, Math.abs(tracker.height - PHYSICS.ballRadius));
        }
        prev = { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z };
        pilot.compute(tracker, pos, vel, out);
      },
    });
    expect(r.outcome).toBe('won');
    expect(stutters.slice(0, 5), `${stutters.length} stuttering steps`).toEqual([]);
    expect(worstLift).toBeLessThan(0.03);
  });
});

describe('physics rules', () => {
  // A plain, wide, straight slope, so these rules don't depend on the level catalog.
  const ramp: LevelDef = {
    id: 99,
    name: 'ramp',
    tagline: '',
    grade: 0.1,
    segments: [straight(50)],
    width: [[0, 10]],
    theme: LEVELS[0].theme,
  };

  it('a ball left alone on the entrance pad stays there', () => {
    const r = simulate(ramp, { maxTime: 3, controller: ({ out }) => ((out.x = 0), (out.y = 0), (out.z = 0)) });
    expect(r.outcome).toBe('timeout');
    expect(Math.abs(r.s - 3)).toBeLessThan(0.2);
  });

  it('pushing sideways off the edge counts as a fall', () => {
    const r = simulate(ramp, {
      maxTime: 10,
      controller: ({ out }) => {
        out.x = 20;
        out.y = 0;
        out.z = 0;
      },
    });
    expect(r.outcome).toBe('fell');
  });

  it('rolling down the middle at a steady pace drops into a hole', () => {
    // A hole near the middle line at s = 21 (radius 1.6); drive straight down it at 6 m/s.
    const r = simulate({ ...ramp, segments: [straight(72)], width: [[0, 12]], holes: [{ s: 21, u: 0.2, r: 1.6 }] }, {
      maxTime: 30,
      controller: ({ tracker, vel, out }) => {
        out.x = -vel.x * 2 - tracker.u * 4;
        out.y = 0;
        out.z = (-6 - vel.z) * 3;
      },
    });
    expect(r.outcome).toBe('fell');
    // That hole: s = 21 after the 7 m entrance pad, radius 1.6.
    expect(r.s).toBeGreaterThan(7 + 21 - 1.6);
    expect(r.s).toBeLessThan(7 + 21 + 1.6 + 2);
  });

  it('holding a full push forward cannot exceed the speed cap by much', () => {
    const r = simulate(ramp, {
      maxTime: 20,
      controller: ({ tracker, vel, out }) => {
        out.x = -vel.x * 2 - tracker.u * 4;
        out.y = 0;
        out.z = -24;
      },
    });
    expect(r.outcome).toBe('won');
    expect(r.maxSpeed).toBeLessThan(19);
  });
});

describe('slopes: routes may go down, run flat or climb', () => {
  const base = { id: 99, name: 'slopes', tagline: '', grade: 0, width: [[0, 8]] as [number, number][], theme: LEVELS[0].theme };

  it('every catalog level stays within the slope limits', () => {
    for (const def of LEVELS) expect(slopeProblems(def), def.name).toEqual([]);
  });

  it('flags slopes that are too steep, change too sharply, or climb right after the start', () => {
    const problems = slopeProblems({
      ...base,
      segments: [straight(5, -0.05), straight(10, 0.15), straight(10, -0.12), straight(10, 0.25), straight(10, 0.25)],
    }).join('\n');
    expect(problems).toMatch(/segment 0 .* climbs within the first/);
    expect(problems).toMatch(/segment 2 .* changes slope too sharply/); // 0.15 -> -0.12
    expect(problems).toMatch(/segment 3 .* steeper than/);
    expect(problems).toMatch(/last segment .* run-out/);
  });

  it('a ball let go on a climb rolls back down', () => {
    const def: LevelDef = { ...base, segments: [straight(14, 0), straight(30, -0.15), straight(10, 0)] };
    expect(slopeProblems(def)).toEqual([]);
    let peak = 0;
    let last = 0;
    const r = simulate(def, {
      maxTime: 15,
      controller: ({ t, tracker, vel, out }) => {
        const pushing = t < 1.4;
        out.x = -vel.x * 2 - tracker.u * 4;
        out.y = 0;
        out.z = pushing ? -12 : 0;
        if (!pushing) peak = Math.max(peak, tracker.s);
        last = tracker.s;
      },
    });
    expect(peak).toBeGreaterThan(7 + 14 + 2); // it made it onto the climb…
    expect(last).toBeLessThan(peak - 3); // …rolled back once released…
    expect(r.outcome).not.toBe('fell'); // …and the flat start kept it from rolling off the back
  });

  it('a modest push gets the ball up the steepest allowed climb', () => {
    const def: LevelDef = {
      ...base,
      segments: [straight(14, 0), straight(25, -MAX_GRADE), straight(8, 0)],
    };
    expect(slopeProblems(def)).toEqual([]);
    const r = simulate(def, {
      maxTime: 40,
      controller: ({ tracker, vel, out }) => {
        out.x = -vel.x * 2 - tracker.u * 4;
        out.y = 0;
        out.z = -0.4 * PHYSICS.maxAccel; // 40 % of a full push
      },
    });
    expect(r.outcome).toBe('won');
  });

  it('the autopilot finishes a level that mixes downhill, flat and uphill sections', () => {
    const def: LevelDef = {
      ...base,
      segments: [
        straight(12, 0.1),
        straight(10, 0),
        straight(15, -0.1),
        straight(8, 0),
        right(70, 16, 0.08),
        straight(14, -0.06),
        straight(10, 0.05),
      ],
    };
    expect(slopeProblems(def)).toEqual([]);
    expect(simulate(def)).toMatchObject({ outcome: 'won' });
  });
});

describe('checkpoints', () => {
  it('every catalog checkpoint sits on a calm rest area', () => {
    for (const def of LEVELS) expect(checkpointProblems(buildLevel(def)), def.name).toEqual([]);
  });

  it.each(LEVELS.filter((l) => (l.checkpoints ?? []).length > 0))(
    'level $id ($name) can be finished from each of its checkpoints',
    (def) => {
      for (const cs of buildLevel(def).checkpoints) {
        const r = simulate(def, { startS: cs });
        expect(r, `from checkpoint at s ${cs}: reached s=${r.s.toFixed(1)}`).toMatchObject({ outcome: 'won' });
      }
    },
  );

  it('flags gates on a curve or a climb, near a hole, too close together, to the start or to the finish', () => {
    const def: LevelDef = {
      id: 99,
      name: 'checkpoints',
      tagline: '',
      grade: 0.05,
      segments: [straight(30), right(90, 20), straight(20, -0.05), straight(40, 0.03)],
      width: [[0, 8]],
      holes: [{ s: 103, u: 2, r: 1 }],
      checkpoints: [10, 45, 70, 100, 110],
      theme: LEVELS[0].theme,
    };
    const problems = checkpointProblems(buildLevel(def)).join('\n');
    expect(problems).toMatch(/5 checkpoints \(at most 3\)/);
    expect(problems).toMatch(/checkpoint 0 .* after the start/);
    expect(problems).toMatch(/checkpoint 1 .* not on a straight/);
    expect(problems).toMatch(/checkpoint 2 .* grade -0.05/);
    expect(problems).toMatch(/checkpoint 3 .* hole/);
    expect(problems).toMatch(/checkpoint 4 .* after checkpoint 3/);
    expect(problems).toMatch(/checkpoint 4 .* before the finish line/);
    expect(problems).not.toMatch(/checkpoint 3 .* (straight|grade|narrower)/);
  });

  it('activate in order, only forward: rolling back never undoes one', () => {
    const cps = [10, 20, 30];
    expect(passedCheckpoint(cps, 5, -1)).toBe(-1);
    expect(passedCheckpoint(cps, 12, -1)).toBe(0);
    expect(passedCheckpoint(cps, 25, 0)).toBe(1);
    expect(passedCheckpoint(cps, 35, -1)).toBe(2); // the furthest one passed wins
    expect(passedCheckpoint(cps, 5, 1)).toBe(1); // rolled back behind the gate
    expect(passedCheckpoint([], 50, -1)).toBe(-1);
  });
});

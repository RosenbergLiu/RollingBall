import { beforeAll, describe, expect, it } from 'vitest';
import { buildLevel, MAX_GRADE, slopeProblems, type LevelDef } from '../src/game/level';
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
    const shapes = LEVELS.map((l) => JSON.stringify([l.segments, l.width, l.holes ?? []]));
    expect(new Set(shapes).size).toBe(LEVELS.length);
  });

  it('keeps at least 8 m between the surfaces wherever a route passes over itself', () => {
    for (const def of LEVELS) {
      const { path, widthAt } = buildLevel(def);
      const every = Math.round(1 / path.ds); // check every meter
      const S = path.samples;
      for (let i = 0; i < S.length; i += every) {
        // Only compare parts of the route at least 20 m apart along the path.
        for (let j = i + Math.round(20 / path.ds); j < S.length; j += every) {
          const a = S[i].pos;
          const b = S[j].pos;
          const reach = (widthAt(i * path.ds) + widthAt(j * path.ds)) / 2 + 0.5;
          if (Math.hypot(a.x - b.x, a.z - b.z) < reach) {
            expect(Math.abs(a.y - b.y), `${def.name}: s ${(i * path.ds).toFixed(0)} over s ${(j * path.ds).toFixed(0)}`).toBeGreaterThan(8);
          }
        }
      }
    }
  });

  it('keeps every hole inside the authored part of the path', () => {
    for (const def of LEVELS) {
      const level = buildLevel(def);
      for (const h of level.holes) {
        expect(h.s - h.r).toBeGreaterThan(level.spawnS + 3);
        expect(h.s + h.r).toBeLessThan(level.finishS - 1);
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

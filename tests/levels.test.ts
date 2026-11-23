import { beforeAll, describe, expect, it } from 'vitest';
import { buildLevel } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { initPhysics } from '../src/game/physics';
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
  it('a ball left alone on the entrance pad stays there', () => {
    const r = simulate(LEVELS[0], { maxTime: 3, controller: ({ out }) => ((out.x = 0), (out.y = 0), (out.z = 0)) });
    expect(r.outcome).toBe('timeout');
    expect(Math.abs(r.s - 3)).toBeLessThan(0.2);
  });

  it('pushing sideways off the edge counts as a fall', () => {
    const r = simulate(LEVELS[0], {
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
    // Level 4 has a hole centered on the middle line; drive straight down it at 6 m/s.
    const r = simulate(LEVELS[3], {
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
    const r = simulate(LEVELS[0], {
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

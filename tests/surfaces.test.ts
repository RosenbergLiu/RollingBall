import { beforeAll, describe, expect, it } from 'vitest';
import { buildLevel, ENTRANCE_LENGTH, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { right, straight } from '../src/game/path';
import { initPhysics } from '../src/game/physics';
import { noteHz } from '../src/game/sound';
import {
  applySurfaces,
  BOOST,
  boostPad,
  musicTiles,
  note,
  surfaceAt,
  SurfaceContact,
  surfaceProblems,
} from '../src/game/surfaces';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

const theme = LEVELS[0].theme;
const flat = (extra: Partial<LevelDef>): LevelDef => ({
  id: 99,
  name: 'surfaces',
  tagline: '',
  grade: 0,
  segments: [straight(16, 0.03), straight(60, 0)],
  width: [[0, 8]],
  theme,
  ...extra,
});

describe('authoring helpers', () => {
  it('name notes in semitones from C5', () => {
    expect(note('C5')).toBe(0);
    expect(note('A4')).toBe(-3);
    expect(note('C6')).toBe(12);
    expect(note('F#5')).toBe(6);
    expect(note('Bb4')).toBe(-2);
    expect(() => note('H2')).toThrow();
    expect(noteHz(note('A4'))).toBeCloseTo(440, 1);
  });

  it('lay out rows of music tiles and boost pads', () => {
    expect(musicTiles(10, 2, ['C5', 'E5'], -1, 1)).toEqual([
      { type: 'music', s0: 10, s1: 12, u0: -1, u1: 1, note: 0 },
      { type: 'music', s0: 12, s1: 14, u0: -1, u1: 1, note: 4 },
    ]);
    expect(boostPad(20)).toEqual({ type: 'boost', s0: 20, s1: 24, u0: undefined, u1: undefined });
  });
});

describe('surfaces in play', () => {
  const level = buildLevel(
    flat({ surfaces: [...musicTiles(20, 2, ['C5', 'D5'], -1, 1), boostPad(40, 4, 0, 3)] }),
  );
  const at = (s: number) => s + ENTRANCE_LENGTH;

  it('finds the tile under the ball, and nothing beside or between tiles', () => {
    expect(surfaceAt(level, at(21), 0)?.note).toBe(0);
    expect(surfaceAt(level, at(23), 0.5)?.note).toBe(2);
    expect(surfaceAt(level, at(21), 1.5)).toBeNull(); // beside the lane
    expect(surfaceAt(level, at(30), 0)).toBeNull();
    expect(surfaceAt(level, at(42), 1)?.type).toBe('boost');
    expect(surfaceAt(level, at(42), -1)).toBeNull(); // the pad covers the right half only
  });

  it('a tile triggers once when the ball rolls onto it, and not while the ball is in the air', () => {
    const contact = new SurfaceContact();
    const onGround = { s: at(20.5), u: 0, height: 0.5 };
    expect(contact.update(level, onGround)?.note).toBe(0);
    expect(contact.update(level, { ...onGround, s: at(21) })).toBeNull(); // still on it
    expect(contact.update(level, { ...onGround, s: at(22.5) })?.note).toBe(2); // the next key
    contact.reset();
    expect(contact.update(level, { ...onGround, height: 2 })).toBeNull(); // airborne
  });

  it('boost arrows push forward along the route while the ball rolls on them', () => {
    const contact = new SurfaceContact();
    const accel = { x: 0, y: 0, z: 0 };
    expect(applySurfaces(level, { s: at(41), u: 1, height: 0.5 }, contact, accel)?.type).toBe('boost');
    // The route heads -Z: the push points that way at full boost strength.
    expect(accel.z).toBeCloseTo(-BOOST.accel, 1);
    expect(Math.abs(accel.x)).toBeLessThan(1e-6);
    const off = { x: 0, y: 0, z: 0 };
    applySurfaces(level, { s: at(41), u: -1, height: 0.5 }, new SurfaceContact(), off);
    expect(off.z).toBe(0);
  });

  it('a boost pad really speeds the ball up (with the physics), and the speed cap still holds', () => {
    const run = (def: LevelDef) => {
      const speeds = { before: 0, after: 0 };
      const r = simulate(def, {
        maxTime: 30,
        controller: ({ tracker, vel, out }) => {
          // Push gently up to 4 m/s down the middle, never braking (so the boost shows).
          out.x = -vel.x * 2 - tracker.u * 4;
          out.y = 0;
          out.z = Math.min(0, (-4 - vel.z) * 3);
          const sp = Math.hypot(vel.x, vel.z);
          if (tracker.s < at(30)) speeds.before = sp;
          if (tracker.s < at(52)) speeds.after = sp;
        },
      });
      return { ...speeds, r };
    };
    const plain = run(flat({}));
    const boosted = run(flat({ surfaces: [boostPad(40)] }));
    expect(plain.after - plain.before).toBeLessThan(1);
    expect(boosted.after - boosted.before).toBeGreaterThan(4);
    expect(boosted.r.boosts).toBe(1);
    expect(boosted.r.maxSpeed).toBeLessThan(19);
  });
});

describe('surface design rules', () => {
  it('every catalog level places its surfaces correctly', () => {
    for (const def of LEVELS) expect(surfaceProblems(buildLevel(def)), def.name).toEqual([]);
  });

  it('flags tiles over the edge or a hole, overlapping, too short, out of range, and unsafe boosts', () => {
    const def: LevelDef = {
      ...flat({}),
      segments: [straight(20, 0.03), straight(30, 0), right(40, 15, 0), straight(30, 0)],
      holes: [{ s: 35, u: 2, r: 1 }],
      surfaces: [
        { type: 'music', s0: 5, s1: 6, note: 0 }, // too short
        { type: 'music', s0: 8, s1: 10, note: 40 }, // note out of range
        { type: 'music', s0: 12, s1: 14, u0: 1, u1: 5, note: 0 }, // over the edge
        { type: 'music', s0: 13, s1: 15, u0: -2, u1: 2, note: 2 }, // overlaps the one before
        { type: 'music', s0: 34, s1: 36, u0: 0, u1: 3, note: 0 }, // over the hole
        boostPad(25), // leads into the hole at s 35
        boostPad(42), // leads into the r 15 curve
        boostPad(55), // on the curve
      ],
    };
    const problems = surfaceProblems(buildLevel(def)).join('\n');
    expect(problems).toMatch(/music tile at s 5.0–6.0 is shorter than/);
    expect(problems).toMatch(/music tile at s 8.0–10.0 has note 40 out of range/);
    expect(problems).toMatch(/music tile at s 12.0–14.0 sticks out over the edge/);
    expect(problems).toMatch(/music tile at s 13.0–15.0 overlaps the music tile at s 12.0–14.0/);
    expect(problems).toMatch(/music tile at s 34.0–36.0 overlaps the hole/);
    expect(problems).toMatch(/boost tile at s 25.0–29.0 leads into the hole/);
    expect(problems).toMatch(/boost tile at s 42.0–46.0 leads into a curve tighter than/);
    expect(problems).toMatch(/boost tile at s 55.0–59.0 is not on a straight/);
    // The pad on the curve also leads further into it; nothing else is flagged.
    expect(problems.split('\n')).toHaveLength(9);
  });
});

describe('Musical Bridge', () => {
  it('rolling the coin line down the middle plays "Twinkle Twinkle Little Star"', () => {
    const def = LEVELS.find((l) => l.name === 'Musical Bridge')!;
    const r = simulate(def);
    expect(r.outcome).toBe('won');
    const twinkle = ['C5', 'C5', 'G5', 'G5', 'A5', 'A5', 'G5', 'F5', 'F5', 'E5', 'E5', 'D5', 'D5', 'C5'].map(note);
    expect(r.notes.join(',')).toContain(twinkle.join(','));
    // ...and the curve climbs the scale to the top C.
    expect(r.notes).toContain(note('C7'));
  });
});

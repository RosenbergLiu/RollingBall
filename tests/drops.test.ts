import { beforeAll, describe, expect, it } from 'vitest';
import { dropProblems, dropTo, landingLength, lips } from '../src/game/drops';
import { buildLevel, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { left, straight } from '../src/game/path';
import { initPhysics } from '../src/game/physics';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

const waterfall = LEVELS.find((l) => l.name === 'Waterfall Steps')!;

/** A main route ending in a lip at s 30, 8 m wide, with a landing piece built from `landing`. */
const oneDrop = (landing: Partial<Parameters<typeof dropTo>[2]> & { height?: number; overlap?: number; turn?: number; u?: number }): LevelDef => {
  const piece = dropTo(
    'low',
    { from: 'main', lip: 30, height: landing.height ?? 2.5, overlap: landing.overlap },
    { segments: landing.segments ?? [straight(30, 0.03)], width: landing.width ?? [[0, 12]], holes: landing.holes, finish: true },
  );
  if (landing.turn !== undefined) piece.from.turn = landing.turn;
  if (landing.u !== undefined) piece.from.u = landing.u;
  return {
    id: 99,
    name: 'drop',
    tagline: '',
    grade: 0.05,
    segments: [straight(24, 0.05), straight(6, 0.02)],
    width: [[0, 8]],
    pieces: [piece],
    theme: LEVELS[0].theme,
  };
};

describe('drop rules', () => {
  it('need a longer landing zone for a higher drop (the guide table)', () => {
    expect(landingLength(1.5)).toBe(10);
    expect(landingLength(2.5)).toBe(12);
    expect(landingLength(4)).toBe(14);
    expect(landingLength(3.25)).toBeCloseTo(13, 5);
  });

  it('every catalog level follows them', () => {
    for (const def of LEVELS) expect(dropProblems(buildLevel(def)), def.name).toEqual([]);
  });

  it('accept a good drop, and find its lip', () => {
    const level = buildLevel(oneDrop({}));
    expect(dropProblems(level)).toEqual([]);
    expect(lips(level).map((p) => p.id)).toEqual(['main']);
  });

  it('flag a drop that is too high, starts past the lip, turns or slides sideways', () => {
    const p = (d: Parameters<typeof oneDrop>[0]) => dropProblems(buildLevel(oneDrop(d))).join('\n');
    expect(p({ height: 5 })).toMatch(/5\.0 m high/);
    expect(p({ height: 1 })).toMatch(/1\.0 m high/);
    expect(p({ overlap: -2 })).toMatch(/must start at least 0.5 m under the lip/);
    expect(p({ turn: 30 })).toMatch(/turns more than 10°/);
    expect(p({ u: 3 })).toMatch(/narrower than 1.5× the lip \(or off to the side\)/);
  });

  it('flag a landing that is too narrow, too short, curved, steep or has a hole', () => {
    const p = (d: Parameters<typeof oneDrop>[0]) => dropProblems(buildLevel(oneDrop(d))).join('\n');
    expect(p({ width: [[0, 10]] })).toMatch(/narrower than 1.5× the lip/);
    expect(p({ segments: [straight(8, 0.03)] })).toMatch(/landing zone is shorter than 13.5 m/);
    expect(p({ segments: [straight(4, 0.03), left(60, 20, 0.03)] })).toMatch(/must be straight and gentle/);
    expect(p({ segments: [straight(30, 0.1)] })).toMatch(/must be straight and gentle/);
    expect(p({ holes: [{ s: 8, u: 3, r: 1 }] })).toMatch(/hole at s 8 in the landing zone/);
  });

  it('flag a launch pad that curves or climbs into the lip', () => {
    const def = oneDrop({});
    def.segments = [straight(24, 0.05), left(20, 17.19, 0.02)];
    expect(dropProblems(buildLevel(def)).join('\n')).toMatch(/must be straight and not climbing/);
  });
});

describe('Waterfall Steps', () => {
  it('the autopilot drops down every step to the finish', () => {
    const r = simulate(waterfall);
    expect(r.outcome).toBe('won');
    expect(r.pieces).toEqual(['main', 'step1', 'step2', 'step3']);
  });

  it('a slow ball lands on every step too (each one starts under its lip)', () => {
    const r = simulate(waterfall, {
      maxTime: 90,
      controller: ({ tracker, vel, out }) => {
        // Creep down the middle of whatever piece the ball is on, at 2.5 m/s.
        const f = tracker.piece.path.samples[Math.min(tracker.index + 8, tracker.piece.path.samples.length - 1)];
        const th = Math.hypot(f.tan.x, f.tan.z) || 1;
        const fx = f.tan.x / th;
        const fz = f.tan.z / th;
        out.x = (fx * 2.5 - vel.x) * 3 - f.right.x * tracker.u * 3;
        out.y = 0;
        out.z = (fz * 2.5 - vel.z) * 3 - f.right.z * tracker.u * 3;
      },
    });
    expect(r.outcome).toBe('won');
    expect(r.pieces).toEqual(['main', 'step1', 'step2', 'step3']);
  });
});

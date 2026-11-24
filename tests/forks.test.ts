import { beforeAll, describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import { forkBranch, forkProblems, swing, swingLength } from '../src/game/forks';
import { buildLevel, pieceProblems, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { buildPath, straight } from '../src/game/path';
import { initPhysics, PHYSICS } from '../src/game/physics';
import { note } from '../src/game/surfaces';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

const twoPaths = LEVELS.find((l) => l.name === 'Two Paths')!;

/** A plain fork: main swings right at s 18, a branch swings left; both meet again. */
const fork = (overrides: { offset?: number; branch?: Partial<LevelDef['pieces'] extends (infer P)[] | undefined ? P : never> } = {}): LevelDef => {
  const offset = overrides.offset ?? 9;
  const branch = forkBranch('b', { at: 18, side: 'left', offset, radius: 14, middle: 8, grade: 0.06 }, { width: [[0, 8]] });
  return {
    id: 99,
    name: 'fork',
    tagline: '',
    grade: 0.05,
    segments: [straight(12, 0.05), straight(6, 0), ...swing('right', offset, 14, 8, 0.06), straight(8, 0), straight(16, 0.06)],
    width: [[0, 8]],
    pieces: [{ ...branch, ...overrides.branch }],
    theme: LEVELS[0].theme,
  };
};

describe('swing', () => {
  it('swings out by the offset and comes back onto the same line, heading the same way', () => {
    const path = buildPath(swing('left', 9, 14, 8, 0.06), 0);
    const end = path.samples[path.samples.length - 1];
    expect(end.pos.x).toBeCloseTo(0, 1); // back on the line (heading -Z)
    expect(end.tan.x).toBeCloseTo(0, 5);
    expect(path.length).toBeCloseTo(swingLength(9, 14, 8), 0);
    const widest = Math.min(...path.samples.map((s) => s.pos.x)); // left = -X
    expect(widest).toBeCloseTo(-9, 1);
    // The first and last bends are flat (the fork's junctions); the middle carries the slope.
    const segs = swing('right', 9, 14, 8, 0.06);
    expect([segs[0].grade, segs[4].grade]).toEqual([0, 0]);
  });
});

describe('fork rules', () => {
  it('every catalog level follows them', () => {
    for (const def of LEVELS) expect(forkProblems(buildLevel(def)), def.name).toEqual([]);
  });

  it('accept a plain fork', () => {
    expect(forkProblems(buildLevel(fork()))).toEqual([]);
    expect(pieceProblems(fork())).toEqual([]);
  });

  it('flag a branch that rejoins in the wrong place', () => {
    const def = fork({ branch: { to: { piece: 'main', s: 60 } } });
    expect(forkProblems(buildLevel(def)).join('\n')).toMatch(/doesn't line up where it rejoins main/);
  });

  it('flag a junction where the two tracks are not level with each other (a seam the ball bumps on)', () => {
    const segs = swing('left', 9, 14, 8, 0.06);
    segs[0] = { ...segs[0], grade: 0.06 }; // the first bend slopes: the branch sinks below the main route
    const def = fork({ branch: { segments: segs } });
    expect(forkProblems(buildLevel(def)).join('\n')).toMatch(/cm off the level of main where they overlap/);
  });

  it('flag ways that never separate, a narrow junction and a hole near one', () => {
    expect(forkProblems(buildLevel(fork({ offset: 4 }))).join('\n')).toMatch(/doesn't separate from main/);
    const narrow = fork({ branch: { width: [[0, 4]] } });
    narrow.width = [[0, 5]];
    expect(forkProblems(buildLevel(narrow)).join('\n')).toMatch(/main is narrower than 6 m where it leaves/);
    const holed = fork({ branch: { holes: [{ s: 5, u: 0, r: 1 }] } });
    expect(forkProblems(buildLevel(holed)).join('\n')).toMatch(/hole at s 5 near a junction/);
  });

  it('flag a branch much longer than the way it bypasses, and a dead end', () => {
    const long = fork({ branch: { segments: [...swing('left', 9, 14, 30, 0.06)] } });
    long.pieces![0].to = { piece: 'main', s: 18 + swingLength(9, 14, 8) };
    expect(forkProblems(buildLevel(long)).join('\n')).toMatch(/as long as the way it bypasses/);
    const dead = fork({ branch: { to: undefined } });
    expect(forkProblems(buildLevel(dead)).join('\n')).toMatch(/piece b is a dead end/);
  });

  it('piece rules check where a branch rejoins', () => {
    const bad = fork({ branch: { to: { piece: 'nowhere', s: 50 } } });
    expect(pieceProblems(bad).join('\n')).toMatch(/merges into "nowhere"/);
    const back = fork({ branch: { to: { piece: 'main', s: 10 } } });
    expect(pieceProblems(back).join('\n')).toMatch(/merges back before where it starts/);
  });
});

describe('Two Paths', () => {
  it('the autopilot can take either way, and the left way plays its keys', () => {
    const rightWay = simulate(twoPaths);
    expect(rightWay.outcome).toBe('won');
    expect(rightWay.pieces).toEqual(['main']);
    const leftWay = simulate(twoPaths, { route: ['left'] });
    expect(leftWay.outcome).toBe('won');
    expect(leftWay.pieces).toEqual(['main', 'left', 'main']);
    expect(leftWay.notes).toEqual(['C5', 'E5', 'G5', 'C6'].map(note));
  });

  it('rolls smoothly across both junctions at speed (no seam bumps)', () => {
    const level = buildLevel(twoPaths);
    const pilot = new Autopilot(level);
    pilot.route.add('left');
    pilot.cruiseSpeed = 14;
    let worstLift = 0;
    let prev: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null = null;
    const stutters: string[] = [];
    const r = simulate(twoPaths, {
      controller: ({ tracker, pos, vel, out }) => {
        if (prev) {
          const moved = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z);
          const expected = (Math.hypot(vel.x + prev.vx, vel.y + prev.vy, vel.z + prev.vz) / 2) * PHYSICS.dt;
          if (expected > 4 * PHYSICS.dt && Math.abs(moved / expected - 1) > 0.1) stutters.push(`${tracker.piece.id} s ${tracker.s.toFixed(1)}`);
          worstLift = Math.max(worstLift, Math.abs(tracker.height - PHYSICS.ballRadius));
        }
        prev = { x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z };
        pilot.compute(tracker, pos, vel, out);
      },
    });
    expect(r.outcome).toBe('won');
    expect(r.pieces).toEqual(['main', 'left', 'main']);
    expect(stutters.slice(0, 5)).toEqual([]);
    expect(worstLift).toBeLessThan(0.03);
  });

  it('a ball that drops into the gap between the two ways falls', () => {
    // Roll straight ahead (-Z) at the fork: the two ways curve off to either side.
    const r = simulate(twoPaths, {
      maxTime: 20,
      controller: ({ vel, out }) => {
        out.x = -vel.x * 3;
        out.y = 0;
        out.z = (-6 - vel.z) * 3;
      },
    });
    expect(r.outcome).toBe('fell');
    expect(r.s).toBeGreaterThan(7 + 18);
  });
});


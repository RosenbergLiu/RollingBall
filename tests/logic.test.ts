import { describe, expect, it } from 'vitest';
import { buildLevel, ENTRANCE_LENGTH, holeDistance, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { buildPath, left, pathAt, straight } from '../src/game/path';
import { buildPlatform } from '../src/game/platform';
import { defaultProgress, isUnlocked, nextPlayableLevel, recordCompletion, sanitizeProgress } from '../src/game/progress';
import { PathTracker } from '../src/game/tracker';

const theme = LEVELS[0].theme;

describe('path', () => {
  it('descends by the grade and keeps its length', () => {
    const p = buildPath([straight(20)], 0.1);
    expect(p.length).toBeCloseTo(20, 5);
    const end = p.samples[p.samples.length - 1].pos;
    expect(end.z).toBeCloseTo(-20, 3);
    expect(end.y).toBeLessThan(-1.5);
    expect(end.y).toBeGreaterThan(-2.1);
  });

  it('turns left through the requested angle', () => {
    const p = buildPath([left(90, 10)], 0);
    const last = p.samples[p.samples.length - 1];
    // Heading -X after a 90° left turn from -Z, ending at (-10, 0, -10).
    expect(last.tan.x).toBeCloseTo(-1, 2);
    expect(last.pos.x).toBeCloseTo(-10, 1);
    expect(last.pos.z).toBeCloseTo(-10, 1);
    expect(last.curvature).toBeCloseTo(0.1, 5);
  });

  it('has orthonormal frames with the normal pointing up', () => {
    const p = buildPath([straight(5, 0), left(120, 8, 0.2), straight(5)], 0.15);
    for (const s of p.samples) {
      expect(s.normal.y).toBeGreaterThan(0.9);
      expect(Math.abs(s.normal.dot(s.tan))).toBeLessThan(1e-5);
      expect(Math.abs(s.right.y)).toBeLessThan(1e-9);
    }
  });
});

describe('platform', () => {
  const def: LevelDef = {
    id: 99,
    name: 'test',
    tagline: '',
    grade: 0.1,
    segments: [straight(30)],
    width: [[0, 8]],
    holes: [{ s: 15, u: 0, r: 1.5 }],
    theme,
  };

  it('cuts round holes and produces finite geometry', () => {
    const level = buildLevel(def);
    const m = buildPlatform(level);
    expect(m.cells.removed).toBeGreaterThan(20);
    expect(m.top.positions.every(Number.isFinite)).toBe(true);
    expect(m.walls.indices.length).toBeGreaterThan(0);
    // No top triangle has its centroid inside the hole.
    const h = level.holes[0];
    const P = m.top.positions;
    for (let t = 0; t < m.top.indices.length; t += 3) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 3; k++) {
        x += P[m.top.indices[t + k] * 3] / 3;
        z += P[m.top.indices[t + k] * 3 + 2] / 3;
      }
      // Straight path along -Z: s = -z, u = x.
      expect(holeDistance(h, -z, x)).toBeGreaterThan(h.r - 0.05);
    }
  });

  it('builds every catalog level without degenerate output', () => {
    for (const d of LEVELS) {
      const m = buildPlatform(buildLevel(d));
      expect(m.topCollider.indices.length % 3).toBe(0);
      expect(m.topCollider.vertices.every(Number.isFinite)).toBe(true);
      expect(Math.max(...m.topCollider.indices)).toBeLessThan(m.topCollider.vertices.length / 3);
    }
  });
});

describe('tracker', () => {
  it('reports progress, lateral offset and height', () => {
    const level = buildLevel({ ...LEVELS[0] });
    const t = new PathTracker(level);
    t.reset(level.spawnS);
    const f = pathAt(level.path, 10);
    const p = f.pos.clone().addScaledVector(f.right, 2).addScaledVector(f.normal, 0.5);
    t.update(p);
    expect(t.s).toBeCloseTo(10, 1);
    expect(t.u).toBeCloseTo(2, 2);
    expect(t.height).toBeCloseTo(0.5, 2);
  });

  it('does not jump to a lower spiral loop', () => {
    const level = buildLevel(LEVELS[5]);
    const t = new PathTracker(level);
    const s = ENTRANCE_LENGTH + 8 + 10;
    t.reset(s);
    const f = pathAt(level.path, s);
    // Directly below the current point the lower loop passes ~10 m down.
    t.update(f.pos.clone().add({ x: 0, y: -9, z: 0 } as never));
    expect(Math.abs(t.s - s)).toBeLessThan(1);
    expect(t.height).toBeLessThan(-8);
  });
});

describe('progress', () => {
  it('starts with only level 1 unlocked', () => {
    const p = defaultProgress();
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });

  it('unlocks the next level and keeps the best time', () => {
    let r = recordCompletion(defaultProgress(), 1, 20, 8);
    expect(r.progress.unlocked).toBe(2);
    expect(r.newBest).toBe(true);
    expect(r.unlockedNext).toBe(true);
    r = recordCompletion(r.progress, 1, 25, 8);
    expect(r.newBest).toBe(false);
    expect(r.best).toBe(20);
    expect(r.unlockedNext).toBe(false);
    r = recordCompletion(r.progress, 1, 18, 8);
    expect(r.best).toBe(18);
  });

  it('never unlocks beyond the last level', () => {
    const r = recordCompletion({ unlocked: 8, best: {} }, 8, 10, 8);
    expect(r.progress.unlocked).toBe(8);
  });

  it('sanitizes stored data', () => {
    expect(sanitizeProgress({ unlocked: 99, best: { 1: 12, 2: 'x', 3: -1 } }, 8)).toEqual({ unlocked: 8, best: { 1: 12 } });
    expect(sanitizeProgress('garbage', 8)).toEqual(defaultProgress());
  });

  it('Play picks the first unlocked level without a time', () => {
    expect(nextPlayableLevel({ unlocked: 3, best: { 1: 10 } }, 8)).toBe(2);
    expect(nextPlayableLevel({ unlocked: 2, best: { 1: 10, 2: 11 } }, 8)).toBe(2);
  });
});

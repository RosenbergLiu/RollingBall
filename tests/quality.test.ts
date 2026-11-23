import { describe, expect, it } from 'vitest';
import { buildQualityLevels, QualityGovernor } from '../src/game/quality';

const feed = (g: QualityGovernor, dt: number, n: number) => {
  let changes = 0;
  for (let i = 0; i < n; i++) if (g.sample(dt)) changes++;
  return changes;
};

describe('quality levels', () => {
  it('starts at full retina resolution on an iPad and gets cheaper', () => {
    const levels = buildQualityLevels(2);
    expect(levels[0]).toEqual({ pixelRatio: 2, shadowMapSize: 2048 });
    for (let i = 1; i < levels.length; i++) {
      const cheaper =
        levels[i].pixelRatio < levels[i - 1].pixelRatio || levels[i].shadowMapSize < levels[i - 1].shadowMapSize;
      expect(cheaper).toBe(true);
    }
  });

  it('has no duplicate steps on a non-retina screen', () => {
    const levels = buildQualityLevels(1);
    expect(new Set(levels.map((l) => JSON.stringify(l))).size).toBe(levels.length);
  });
});

describe('quality governor', () => {
  it('keeps quality at a steady 60 fps', () => {
    const g = new QualityGovernor(buildQualityLevels(2));
    expect(feed(g, 1 / 60, 2000)).toBe(0);
    expect(g.level).toBe(0);
  });

  it('steps down one level per window while frames are slow', () => {
    const g = new QualityGovernor(buildQualityLevels(2), 0, { window: 60, warmup: 10 });
    feed(g, 1 / 30, 10 + 60);
    expect(g.level).toBe(1);
    feed(g, 1 / 30, 10 + 60);
    expect(g.level).toBe(2);
  });

  it('never goes below the cheapest level', () => {
    const levels = buildQualityLevels(2);
    const g = new QualityGovernor(levels, 0, { window: 10, warmup: 0 });
    feed(g, 1 / 15, 1000);
    expect(g.level).toBe(levels.length - 1);
  });

  it('ignores warm-up frames and background gaps', () => {
    const g = new QualityGovernor(buildQualityLevels(2), 0, { window: 30, warmup: 20 });
    feed(g, 0.2, 20); // loading hitch during warm-up
    feed(g, 2.0, 50); // app was backgrounded
    feed(g, 1 / 60, 30);
    expect(g.level).toBe(0);
  });

  it('climbs back to full quality once frames are fast again (e.g. Low Power Mode turned off)', () => {
    const levels = buildQualityLevels(2);
    const g = new QualityGovernor(levels, 0, { window: 30, warmup: 5 });
    feed(g, 1 / 30, 2000); // capped at 30 fps: steps all the way down
    expect(g.level).toBe(levels.length - 1);
    feed(g, 1 / 60, 3000); // cap lifted
    expect(g.level).toBe(0);
  });

  it('settles on the best level the device can hold without flip-flopping', () => {
    // Simulated A10X: full quality only manages 40 fps, every cheaper level holds 60 fps.
    const levels = buildQualityLevels(2);
    const g = new QualityGovernor(levels, 3, { window: 30, warmup: 5 });
    const history = new Set<number>();
    for (let i = 0; i < 6000; i++) {
      g.sample(g.level === 0 ? 1 / 40 : 1 / 60);
      if (i > 3000) history.add(g.level);
    }
    expect(g.level).toBe(1);
    expect([...history]).toEqual([1]);
  });

  it('restores a saved level, clamped to the valid range', () => {
    const levels = buildQualityLevels(2);
    expect(new QualityGovernor(levels, 2).level).toBe(2);
    expect(new QualityGovernor(levels, 99).level).toBe(levels.length - 1);
    expect(new QualityGovernor(levels, Number.NaN).level).toBe(0);
  });
});

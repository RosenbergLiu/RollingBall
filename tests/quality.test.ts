import { describe, expect, it } from 'vitest';
import { buildQualityLevels, QualityGovernor } from '../src/game/quality';

/** Feeds frames whose duration depends on the current quality level (a simulated device). */
const run = (g: QualityGovernor, frameTime: (level: number) => number, n: number) => {
  const seen: number[] = [];
  for (let i = 0; i < n; i++) {
    g.sample(frameTime(g.level));
    seen.push(g.level);
  }
  return seen;
};

const opts = { window: 30, warmup: 5 };

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
  it('keeps full quality at a steady 60 fps', () => {
    const g = new QualityGovernor(buildQualityLevels(2));
    run(g, () => 1 / 60, 3000);
    expect(g.level).toBe(0);
  });

  it('steps down until a GPU-bound device is smooth, and stays there', () => {
    // Each cheaper level renders faster: 30, 40, 50, 60, 70 fps.
    const g = new QualityGovernor(buildQualityLevels(2), 0, opts);
    const seen = run(g, (l) => 1 / (30 + 10 * l), 4000);
    expect(g.level).toBe(2); // 50 fps is the first level above the 48 fps threshold
    expect(seen.slice(1500).every((l) => l === 2)).toBe(true); // and it stays there
  });

  it('ignores one-off slow moments (falls, banners, hitches) — seen on the iPad Pro 2nd gen', () => {
    // As measured on the device: levels 0–1 too slow, level 2 at ~58 fps, cheaper ones faster;
    // plus a one-off slow stretch (~30 frames at 35 fps) every 400 frames.
    const fps = [40, 45, 58, 60, 62];
    const g = new QualityGovernor(buildQualityLevels(2), 2, opts);
    let frame = 0;
    const seen = run(
      g,
      (l) => {
        frame++;
        return frame % 400 < 30 ? 1 / 35 : 1 / fps[l];
      },
      8000,
    );
    // It may try level 1 once early on; after that it holds level 2 through every hitch.
    expect(new Set(seen.slice(1500))).toEqual(new Set([2]));
  });

  it('keeps full quality under a 30 fps cap (Low Power Mode): lowering it would not help', () => {
    const g = new QualityGovernor(buildQualityLevels(2), 0, opts);
    const seen = run(g, () => 1 / 30, 4000);
    expect(g.level).toBe(0);
    expect(g.capped).toBe(true);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1); // at most one test step down
  });

  it('climbs back to full quality under a cap when it started at the cheapest level', () => {
    // The iPad Pro 2nd gen case: a saved low level from an earlier session in Low Power Mode.
    const levels = buildQualityLevels(2);
    const g = new QualityGovernor(levels, levels.length - 1, opts);
    run(g, () => 1 / 30, 4000);
    expect(g.level).toBe(0);
  });

  it('under a cap, climbs without flip-flopping (seen on the iPad Pro 2nd gen)', () => {
    const levels = buildQualityLevels(2);
    const g = new QualityGovernor(levels, levels.length - 1, opts);
    const seen = run(g, () => 1 / 30, 4000);
    // Each change is either a step up or the single test step down; never down twice.
    let downs = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] > seen[i - 1]) downs++;
    expect(downs).toBeLessThanOrEqual(1);
    expect(g.level).toBe(0);
  });

  it('when the cap lifts, a GPU-bound device can step down again', () => {
    // Full quality renders at 40 fps; under a 30 fps cap everything is 30 fps.
    const device = (l: number) => (l === 0 ? 1 / 40 : 1 / 60);
    const g = new QualityGovernor(buildQualityLevels(2), 0, opts);
    run(g, (l) => Math.max(1 / 30, device(l)), 3000);
    expect(g.level).toBe(0);
    run(g, device, 3000);
    expect(g.level).toBe(1);
  });

  it('a slow device at the cheapest level does not climb into slower levels', () => {
    // Every level is too slow, but cheaper ones are clearly faster.
    const levels = buildQualityLevels(2);
    const g = new QualityGovernor(levels, 0, opts);
    const seen = run(g, (l) => 1 / (12 + 4 * l), 6000);
    expect(g.level).toBe(levels.length - 1);
    expect(seen.slice(4000).every((l) => l === levels.length - 1)).toBe(true);
  });

  it('settles on the best level the device can hold without flip-flopping', () => {
    // Simulated A10X: full quality only manages 40 fps, every cheaper level holds 60 fps.
    const g = new QualityGovernor(buildQualityLevels(2), 3, opts);
    const seen = run(g, (l) => (l === 0 ? 1 / 40 : 1 / 60), 6000);
    expect(g.level).toBe(1);
    expect(new Set(seen.slice(3000))).toEqual(new Set([1]));
  });

  it('ignores warm-up frames and background gaps', () => {
    const g = new QualityGovernor(buildQualityLevels(2), 0, { window: 30, warmup: 20 });
    for (let i = 0; i < 20; i++) g.sample(0.2); // loading hitch during warm-up
    for (let i = 0; i < 50; i++) g.sample(2.0); // app was backgrounded
    for (let i = 0; i < 30; i++) g.sample(1 / 60);
    expect(g.level).toBe(0);
  });

  it('restores a saved level, clamped to the valid range', () => {
    const levels = buildQualityLevels(2);
    expect(new QualityGovernor(levels, 2).level).toBe(2);
    expect(new QualityGovernor(levels, 99).level).toBe(levels.length - 1);
    expect(new QualityGovernor(levels, Number.NaN).level).toBe(0);
  });
});

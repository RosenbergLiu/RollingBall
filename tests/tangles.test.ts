import { beforeAll, describe, expect, it } from 'vitest';
import { dropProblems, dropTo, lips } from '../src/game/drops';
import { buildLevel, MIN_OVERPASS_GAP, pieceProblems, type BuiltLevel, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { straight } from '../src/game/path';
import { initPhysics } from '../src/game/physics';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

const byName = (name: string) => LEVELS.find((l) => l.name === name)!;

/**
 * The smallest height difference between two parts of the track where one passes right over
 * the other (centerlines within 2 m), or null if they never cross. On one piece, parts less
 * than 20 m apart along it don't count.
 */
function crossingGap(level: BuiltLevel, a: string, b: string): number | null {
  const pa = level.pieces.find((p) => p.id === a)!;
  const pb = level.pieces.find((p) => p.id === b)!;
  let best: number | null = null;
  for (let i = 0; i < pa.path.samples.length; i += 2) {
    for (let j = 0; j < pb.path.samples.length; j += 2) {
      if (pa === pb && Math.abs(i - j) * pa.path.ds < 20) continue;
      const p = pa.path.samples[i].pos;
      const q = pb.path.samples[j].pos;
      if (Math.hypot(p.x - q.x, p.z - q.z) > 2) continue;
      const gap = Math.abs(p.y - q.y);
      if (gap < 0.5) continue; // a level junction, not a crossing
      best = best === null ? gap : Math.min(best, gap);
    }
  }
  return best;
}

describe('Twisted Braid', () => {
  const def = byName('Twisted Braid');
  const level = buildLevel(def);

  it('both ways finish: the main way drops early, the other way drops late and merges back', () => {
    const mainWay = simulate(def);
    expect(mainWay.outcome).toBe('won');
    expect(mainWay.pieces).toEqual(['main', 'a2', 'a3']);
    const otherWay = simulate(def, { route: ['b1'] });
    expect(otherWay.outcome).toBe('won');
    expect(otherWay.pieces).toEqual(['main', 'b1', 'b2', 'b3', 'a3']);
    expect(otherWay.notes.length).toBeGreaterThan(4); // the sky bridge's keys
  });

  it('the two ways cross in an X, the sky bridge more than 8 m above the low way', () => {
    const gap = crossingGap(level, 'a3', 'b1');
    expect(gap).not.toBeNull();
    expect(gap!).toBeGreaterThanOrEqual(MIN_OVERPASS_GAP);
    expect(gap!).toBeLessThan(11);
  });

  it('has a checkpoint on each way of the braid, so every player meets one', () => {
    expect(level.checkpoints.map((c) => c.piece.id)).toEqual(['main', 'b1', 'a3']);
  });
});

describe('Spaghetti Junction', () => {
  const def = byName('Spaghetti Junction');
  const level = buildLevel(def);

  it('both ways finish in the pool: the long loop, and the high road with its drops', () => {
    const loopWay = simulate(def);
    expect(loopWay.outcome).toBe('won');
    expect(loopWay.pieces).toEqual(['main', 'pool']);
    const highRoad = simulate(def, { route: ['high'] });
    expect(highRoad.outcome).toBe('won');
    expect(highRoad.pieces).toEqual(['main', 'high', 'high2', 'high3', 'pool']);
  });

  it('the main way passes under its own start, and the high road crosses over the main way', () => {
    const under = crossingGap(level, 'main', 'main');
    expect(under).not.toBeNull();
    expect(under!).toBeGreaterThanOrEqual(MIN_OVERPASS_GAP);
    const over = crossingGap(level, 'main', 'high');
    expect(over).not.toBeNull();
    expect(over!).toBeGreaterThanOrEqual(MIN_OVERPASS_GAP);
  });

  it('ends in a double waterfall: two lips side by side drop into the same pool', () => {
    expect(
      lips(level)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['high', 'high2', 'high3', 'main']);
    const high3 = level.pieces.find((p) => p.id === 'high3')!;
    expect(high3.dropOnto?.piece).toBe('pool');
    const pool = level.pieces.find((p) => p.id === 'pool')!;
    expect(pool.attach?.piece).toBe('main');
    // The two lips are side by side (a few meters apart), not one over the other.
    const a = level.path.samples[level.path.samples.length - 1].pos;
    const b = high3.path.samples[high3.path.samples.length - 1].pos;
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(6);
    expect(Math.abs(a.x - b.x)).toBeLessThan(9);
  });
});

describe('dropping onto another piece', () => {
  /** A main route with a pool at its lip, and a side road whose lip drops onto the pool. */
  const sideDrop = (opts: { dy?: number; u?: number; poolWidth?: number; sideLength?: number }): LevelDef => {
    const pool = dropTo('pool', { from: 'main', lip: 40, height: 2.5 }, { segments: [straight(40, 0.02)], width: [[0, opts.poolWidth ?? 14]], finish: true });
    pool.from.u = -3.5;
    return {
      id: 99,
      name: 'side drop',
      tagline: '',
      grade: 0.02,
      segments: [straight(34, 0.02), straight(6, 0.02)],
      width: [[0, 6]],
      pieces: [
        pool,
        {
          id: 'side',
          from: { piece: 'main', s: 30, u: opts.u ?? -7, dy: opts.dy ?? 0.5 },
          segments: [straight(opts.sideLength ?? 14, 0.02)],
          width: [[0, 6]],
          dropOnto: 'pool',
        },
      ],
      theme: LEVELS[0].theme,
    };
  };

  it('accepts a lip beside the other lip, above the pool, and the ball lands there', () => {
    const def = sideDrop({});
    expect(pieceProblems(def)).toEqual([]);
    expect(dropProblems(buildLevel(def))).toEqual([]);
  });

  it('flags a lip too high above the pool, not over it, or over too narrow a pool', () => {
    const p = (o: Parameters<typeof sideDrop>[0]) => dropProblems(buildLevel(sideDrop(o))).join('\n');
    expect(p({ dy: 3 })).toMatch(/drop from side onto pool: 5\.\d m high/);
    expect(p({ u: -20 })).toMatch(/its lip isn't above "pool"/);
    expect(p({ poolWidth: 10 })).toMatch(/narrower than 1.5× the lip \(or off to the side\)/);
  });

  it('piece rules check what a lip drops onto', () => {
    const def = sideDrop({});
    def.pieces![1].dropOnto = 'nowhere';
    expect(pieceProblems(def).join('\n')).toMatch(/drops onto "nowhere", which is not another piece/);
    def.pieces![1].dropOnto = 'pool';
    def.pieces![1].finish = true;
    expect(pieceProblems(def).join('\n')).toMatch(/can't also merge or have the finish/);
  });
});

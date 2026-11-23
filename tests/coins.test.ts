import { beforeAll, describe, expect, it } from 'vitest';
import {
  COIN_COLORS,
  COIN_RARITY,
  COIN_SPAWN_CHANCE,
  coinLine,
  coinPosition,
  coinRow,
  coinSpotProblems,
  rollCoins,
  touchedCoins,
  type CoinColor,
} from '../src/game/coins';
import { buildLevel } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { initPhysics } from '../src/game/physics';
import { addCoin, emptyWallet, sanitizeWallet } from '../src/game/wallet';
import { simulate } from './simulate';

/** Small seeded PRNG so random spawns are reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(async () => {
  await initPhysics();
});

describe('coin spots in the level catalog', () => {
  it.each(LEVELS)('level $id ($name) has well-placed coin spots', (def) => {
    const level = buildLevel(def);
    expect(level.coinSpots.length).toBeGreaterThanOrEqual(15);
    expect(level.coinSpots.length).toBeLessThanOrEqual(40);
    expect(coinSpotProblems(level)).toEqual([]);
  });

  it('flags spots in holes, near edges, overlapping or past the finish', () => {
    const level = buildLevel({
      ...LEVELS[0],
      holes: [{ s: 20, u: 0, r: 1.2 }],
      coins: [
        { s: 20, u: 0 }, // in the hole
        { s: 10, u: 4.8 }, // 0.2 m from the edge
        { s: 30, u: 0 },
        { s: 30.5, u: 0 }, // overlaps the previous one
        { s: 60, u: 0 }, // past the finish
      ],
    });
    const problems = coinSpotProblems(level).join('\n');
    expect(problems).toMatch(/spot 0 .* hole/);
    expect(problems).toMatch(/spot 1 .* edge/);
    expect(problems).toMatch(/spot 3 .* overlaps/);
    expect(problems).toMatch(/spot 4 .* finish/);
  });

  it('helpers lay out rows and lines', () => {
    expect(coinRow(10, 3, 2, 1)).toEqual([
      { s: 10, u: 1 },
      { s: 12, u: 1 },
      { s: 14, u: 1 },
    ]);
    expect(coinLine(0, -2, 4, 2, 3)).toEqual([
      { s: 0, u: -2 },
      { s: 2, u: 0 },
      { s: 4, u: 2 },
    ]);
  });
});

describe('coin spawning', () => {
  const level = buildLevel(LEVELS[3]);

  it('only spawns on designated spots, at their positions', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const c of rollCoins(level, mulberry32(seed))) {
        expect(c.spot).toBeGreaterThanOrEqual(0);
        expect(c.spot).toBeLessThan(level.coinSpots.length);
        expect(c.pos.distanceTo(coinPosition(level, level.coinSpots[c.spot]))).toBeLessThan(1e-9);
        expect(c.collected).toBe(false);
      }
    }
  });

  it('gives each play a different set of coins', () => {
    const key = (seed: number) =>
      rollCoins(level, mulberry32(seed))
        .map((c) => `${c.spot}:${c.color}`)
        .join(',');
    const plays = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(key));
    expect(plays.size).toBe(8);
  });

  it('fills about 80 % of spots and keeps the rarity order yellow > blue > purple > orange', () => {
    const rng = mulberry32(42);
    const counts: Record<CoinColor, number> = { yellow: 0, blue: 0, purple: 0, orange: 0 };
    let spawned = 0;
    const plays = 2000;
    for (let i = 0; i < plays; i++) {
      for (const c of rollCoins(level, rng)) {
        counts[c.color]++;
        spawned++;
      }
    }
    expect(spawned / (plays * level.coinSpots.length)).toBeCloseTo(COIN_SPAWN_CHANCE, 1);
    for (const color of COIN_COLORS) expect(counts[color] / spawned).toBeCloseTo(COIN_RARITY[color], 1);
    expect(counts.yellow).toBeGreaterThan(counts.blue);
    expect(counts.blue).toBeGreaterThan(counts.purple);
    expect(counts.purple).toBeGreaterThan(counts.orange);
    expect(counts.orange).toBeGreaterThan(0);
  });
});

describe('coin pickup', () => {
  it('collects a coin the ball touches and ignores far or collected ones', () => {
    const level = buildLevel(LEVELS[0]);
    const coins = rollCoins(level, () => 0); // every spot spawns (yellow)
    const target = coins[0];
    expect(touchedCoins(coins, target.pos)).toEqual([target]);
    expect(touchedCoins(coins, target.pos.clone().add({ x: 1.2, y: 0, z: 0 } as never))).toEqual([]);
    target.collected = true;
    expect(touchedCoins(coins, target.pos)).toEqual([]);
  });

  it('a ball rolling down level 1 picks up the coins on its line', () => {
    const level = buildLevel(LEVELS[0]);
    const coins = rollCoins(level, () => 0);
    let collected = 0;
    const r = simulate(LEVELS[0], {
      maxTime: 30,
      controller: ({ pos, vel, tracker, out }) => {
        for (const c of touchedCoins(coins, pos)) {
          c.collected = true;
          collected++;
        }
        // Roll straight down the middle.
        out.x = -vel.x * 2 - tracker.u * 4;
        out.y = 0;
        out.z = (-6 - vel.z) * 2;
      },
    });
    expect(r.outcome).toBe('won');
    // The 6-coin center row at the start and part of the diagonal line lie on that path.
    expect(collected).toBeGreaterThanOrEqual(6);
  });
});

describe('wallet', () => {
  it('adds coins per color', () => {
    let w = emptyWallet();
    w = addCoin(w, 'yellow');
    w = addCoin(w, 'orange', 2);
    expect(w).toEqual({ yellow: 1, blue: 0, purple: 0, orange: 2 });
  });

  it('sanitizes stored data', () => {
    expect(sanitizeWallet({ yellow: 5, blue: -1, purple: 'x', orange: 2.7, extra: 9 })).toEqual({
      yellow: 5,
      blue: 0,
      purple: 0,
      orange: 2,
    });
    expect(sanitizeWallet(null)).toEqual(emptyWallet());
  });
});

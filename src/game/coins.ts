import { Vector3 } from 'three';
import { holeDistance, MAIN_PIECE, type BuiltLevel, type BuiltPiece } from './level';
import { pathAt } from './path';

/** Coin colors from most common to most rare. */
export const COIN_COLORS = ['yellow', 'blue', 'purple', 'orange'] as const;
export type CoinColor = (typeof COIN_COLORS)[number];

/** Chance that a spawned coin has each color (sums to 1). */
export const COIN_RARITY: Record<CoinColor, number> = {
  yellow: 0.6,
  blue: 0.25,
  purple: 0.11,
  orange: 0.04,
};

/** Display colors for the 3D coins and the UI. */
export const COIN_HEX: Record<CoinColor, string> = {
  yellow: '#facc15',
  blue: '#3b82f6',
  purple: '#a855f7',
  orange: '#f97316',
};

/** Chance that a designated spot holds a coin in a given play. */
export const COIN_SPAWN_CHANCE = 0.8;
/** Coins hover with their center this far above the platform surface. */
export const COIN_HEIGHT = 0.62;
export const COIN_RADIUS = 0.36;
/** Ball-center to coin-center distance that collects a coin (generous for small fingers). */
export const COIN_PICKUP_DISTANCE = 0.95;

/**
 * A designated place where a coin may appear. Coins only ever spawn on these spots.
 * s: meters along the path from the start of the authored segments; u: sideways (+ = right).
 */
export interface CoinSpot {
  s: number;
  u: number;
}

/** `count` spots in a straight row along the path, `spacing` meters apart. */
export function coinRow(s: number, count: number, spacing = 2, u = 0): CoinSpot[] {
  return Array.from({ length: count }, (_, i) => ({ s: s + i * spacing, u }));
}

/** `count` spots on a straight line from (s0, u0) to (s1, u1), ends included. */
export function coinLine(s0: number, u0: number, s1: number, u1: number, count: number): CoinSpot[] {
  return Array.from({ length: count }, (_, i) => {
    const f = count === 1 ? 0 : i / (count - 1);
    return { s: s0 + (s1 - s0) * f, u: u0 + (u1 - u0) * f };
  });
}

/** Explicit spots as [s, u] pairs. */
export function coinSpots(pairs: [number, number][]): CoinSpot[] {
  return pairs.map(([s, u]) => ({ s, u }));
}

export interface SpawnedCoin {
  /** Index of the spot in the level's spot list. */
  spot: number;
  color: CoinColor;
  /** World position of the coin's center. */
  pos: Vector3;
  collected: boolean;
}

/** Picks a color: yellow most often, orange rarely. */
export function rollColor(random: () => number = Math.random): CoinColor {
  let r = random();
  for (const c of COIN_COLORS) {
    r -= COIN_RARITY[c];
    if (r < 0) return c;
  }
  return COIN_COLORS[0];
}

/**
 * Rolls a fresh set of coins for one play of a level: each designated spot holds a coin
 * with COIN_SPAWN_CHANCE, and each coin's color is rolled by rarity. So every play differs.
 */
export function rollCoins(level: BuiltLevel, random: () => number = Math.random): SpawnedCoin[] {
  const coins: SpawnedCoin[] = [];
  let i = 0;
  for (const piece of level.pieces) {
    for (const spot of piece.coinSpots) {
      const index = i++;
      if (random() >= COIN_SPAWN_CHANCE) continue;
      coins.push({ spot: index, color: rollColor(random), pos: coinPosition(piece, spot), collected: false });
    }
  }
  return coins;
}

/** World position of a coin on a spot (spot s is absolute along the built path). */
export function coinPosition(piece: BuiltPiece, spot: CoinSpot): Vector3 {
  const f = pathAt(piece.path, spot.s);
  return f.pos.addScaledVector(f.right, spot.u).addScaledVector(f.normal, COIN_HEIGHT);
}

/** Coins the ball touches at `ball` (not yet collected). */
export function touchedCoins(coins: SpawnedCoin[], ball: { x: number; y: number; z: number }): SpawnedCoin[] {
  const r2 = COIN_PICKUP_DISTANCE * COIN_PICKUP_DISTANCE;
  return coins.filter((c) => {
    if (c.collected) return false;
    const dx = c.pos.x - ball.x;
    const dy = c.pos.y - ball.y;
    const dz = c.pos.z - ball.z;
    return dx * dx + dy * dy + dz * dz < r2;
  });
}

/** Placement rules for coin spots (also documented in docs/level-design-guide.md). */
export const COIN_RULES = {
  /** Minimum distance from the coin's center to the platform edge. */
  edgeMargin: 0.6,
  /** Minimum distance from the coin's center to a hole's rim. */
  holeMargin: 0.6,
  /** Minimum distance between two spots. */
  minSpacing: 1.2,
  /** Spots start at least this far into the authored path… */
  startMargin: 1,
  /** …and end at least this far before the finish line. */
  finishMargin: 1,
};

/** Every rule a level's coin spots break (empty when all spots are valid). */
export function coinSpotProblems(level: BuiltLevel): string[] {
  const problems: string[] = [];
  const all = level.pieces.flatMap((piece) => piece.coinSpots.map((spot) => ({ piece, spot })));
  const positions = all.map(({ piece, spot }) => coinPosition(piece, spot));
  all.forEach(({ piece, spot }, i) => {
    const label = piece.id === MAIN_PIECE ? '' : `piece ${piece.id}: `;
    const where = `${label}coin spot ${i} (s ${(spot.s - piece.offset).toFixed(1)}, u ${spot.u.toFixed(2)})`;
    if (spot.s < piece.offset + COIN_RULES.startMargin) problems.push(`${where} is before the start of the route`);
    // Up to the finish line on the piece that has it; elsewhere up to the piece's end.
    const end = piece.finishLine ?? piece.path.length;
    if (spot.s > end - COIN_RULES.finishMargin) {
      problems.push(`${where} is at or past the ${piece.finishLine === null ? 'end of its piece' : 'finish line'}`);
    }
    const half = piece.widthAt(spot.s) / 2;
    if (Math.abs(spot.u) > half - COIN_RULES.edgeMargin) problems.push(`${where} is too close to the edge`);
    for (const h of piece.holes) {
      if (holeDistance(h, spot.s, spot.u) < h.r + COIN_RULES.holeMargin) problems.push(`${where} is in or too close to a hole`);
    }
    for (let j = 0; j < i; j++) {
      if (positions[i].distanceTo(positions[j]) < COIN_RULES.minSpacing) problems.push(`${where} overlaps coin spot ${j}`);
    }
  });
  return problems;
}

export type CoinCounts = Record<CoinColor, number>;

export const emptyCoinCounts = (): CoinCounts => ({ yellow: 0, blue: 0, purple: 0, orange: 0 });

export function totalCoins(c: CoinCounts): number {
  return COIN_COLORS.reduce((sum, k) => sum + c[k], 0);
}

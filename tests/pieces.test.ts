import { beforeAll, describe, expect, it } from 'vitest';
import { coinRow, coinSpotProblems, rollCoins } from '../src/game/coins';
import {
  buildLevel,
  ENTRANCE_LENGTH,
  overlapProblems,
  pieceProblems,
  slopeProblems,
  type LevelDef,
} from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { pathAt, straight } from '../src/game/path';
import { initPhysics } from '../src/game/physics';
import { musicTiles, note, surfaceProblems } from '../src/game/surfaces';
import { PathTracker } from '../src/game/tracker';
import { simulate } from './simulate';

beforeAll(async () => {
  await initPhysics();
});

/**
 * Two pieces: the main route ends in a lip after 30 m; a wider "lower" piece starts 1.5 m
 * before the lip and 2 m below it (an overlap, so a ball of any speed lands on it) and holds
 * the finish. Coins and music tiles on the lower piece.
 */
const twoPieces: LevelDef = {
  id: 99,
  name: 'two pieces',
  tagline: '',
  grade: 0.05,
  segments: [straight(20, 0.05), straight(10, 0.02)],
  width: [[0, 8]],
  coins: coinRow(3, 4, 2),
  pieces: [
    {
      id: 'lower',
      from: { piece: 'main', s: 28.5, dy: -2 },
      segments: [straight(30, 0.04)],
      width: [[0, 12]],
      coins: coinRow(8, 4, 2),
      surfaces: musicTiles(14, 2, ['C5', 'E5', 'G5']),
      finish: true,
    },
  ],
  theme: LEVELS[0].theme,
};

describe('track pieces', () => {
  const level = buildLevel(twoPieces);
  const [main, lower] = level.pieces;

  it('places a piece relative to the one it starts from', () => {
    expect(level.pieces.map((p) => p.id)).toEqual(['main', 'lower']);
    expect(main).toBe(level);
    // The main route now ends at its lip (no run-out); the finish is on the lower piece.
    expect(main.finishLine).toBeNull();
    expect(main.path.length).toBeCloseTo(ENTRANCE_LENGTH + 30, 5);
    expect(level.finish).toBe(lower);
    const start = lower.path.samples[0].pos;
    const anchor = pathAt(main.path, ENTRANCE_LENGTH + 28.5).pos;
    expect(start.x).toBeCloseTo(anchor.x, 5);
    expect(start.z).toBeCloseTo(anchor.z, 5);
    expect(start.y).toBeCloseTo(anchor.y - 2, 5);
    expect(lower.attach).toEqual({ piece: 'main', s: ENTRANCE_LENGTH + 28.5 });
  });

  it('turns and shifts a piece as asked', () => {
    const turned = buildLevel({
      ...twoPieces,
      pieces: [{ ...twoPieces.pieces![0], from: { piece: 'main', s: 10, u: 3, dy: -12, turn: 90 } }],
    }).pieces[1];
    const t = turned.path.samples[0].tan;
    // The main route heads -Z; turned 90° left it heads -X.
    expect(t.x).toBeLessThan(-0.99);
    expect(Math.abs(t.z)).toBeLessThan(1e-6);
    const p = turned.path.samples[0].pos;
    const anchor = pathAt(main.path, ENTRANCE_LENGTH + 10).pos;
    expect(p.x).toBeCloseTo(anchor.x + 3, 5); // 3 m to the right of the main route (+X)
    expect(p.y).toBeCloseTo(anchor.y - 12, 5);
  });

  it('counts route distance across pieces (checkpoints are ordered by it)', () => {
    expect(lower.routeStart).toBeCloseTo(ENTRANCE_LENGTH + 28.5, 5);
    expect(level.routeLength).toBeCloseTo(lower.routeStart + level.finishS, 5);
  });

  it('passes the design rules, with coins and tiles on the lower piece', () => {
    expect([...pieceProblems(twoPieces), ...slopeProblems(twoPieces), ...overlapProblems(level), ...coinSpotProblems(level), ...surfaceProblems(level)]).toEqual([]);
    expect(pieceProblems(twoPieces)).toEqual([]);
    expect(slopeProblems(twoPieces)).toEqual([]);
    expect(overlapProblems(level)).toEqual([]); // the overlap under the lip is allowed
    expect(coinSpotProblems(level)).toEqual([]);
    expect(surfaceProblems(level)).toEqual([]);
    const coins = rollCoins(level, () => 0);
    expect(coins).toHaveLength(8);
    // The lower piece's coins hover over the lower piece.
    const c = coins[4].pos;
    const under = pathAt(lower.path, 8).pos;
    expect(c.y - under.y).toBeGreaterThan(0.4);
    expect(c.y - under.y).toBeLessThan(0.8);
  });

  it('the autopilot rolls off the lip, lands on the lower piece and finishes there', () => {
    const r = simulate(twoPieces);
    expect(r.outcome).toBe('won');
    expect(r.pieces).toEqual(['main', 'lower']);
    expect(r.notes).toEqual(['C5', 'E5', 'G5'].map(note));
  });

  it('a slow ball also lands: the lower piece starts under the lip', () => {
    const r = simulate(twoPieces, {
      maxTime: 40,
      controller: ({ tracker, vel, out }) => {
        // Creep along at 2 m/s down the middle.
        out.x = -vel.x * 2 - tracker.u * 4;
        out.y = 0;
        out.z = (-2 - vel.z) * 3;
      },
    });
    expect(r.outcome).toBe('won');
    expect(r.pieces).toEqual(['main', 'lower']);
  });

  it('falling off the side of the lower piece is still a fall', () => {
    const r = simulate(twoPieces, {
      maxTime: 20,
      controller: ({ tracker, vel, out }) => {
        out.y = 0;
        if (tracker.piece.id === 'lower' && tracker.s > 6) {
          out.x = 20;
          out.z = 0;
        } else {
          out.x = -vel.x * 2 - tracker.u * 4;
          out.z = (-5 - vel.z) * 3;
        }
      },
    });
    expect(r.outcome).toBe('fell');
    expect(r.piece).toBe('lower');
  });

  it('rolling off the side of the main route, where nothing is below, is a fall', () => {
    const r = simulate(twoPieces, {
      maxTime: 10,
      controller: ({ out }) => {
        out.x = 20;
        out.y = 0;
        out.z = 0;
      },
    });
    expect(r.outcome).toBe('fell');
    expect(r.pieces).toEqual(['main']);
  });

  it('the tracker moves to the lower piece while the ball is in the air over it', () => {
    const t = new PathTracker(level);
    t.reset(ENTRANCE_LENGTH + 29);
    // Just past the lip, 1 m above the lip height: over the lower piece, 3 m above its surface.
    const lip = pathAt(main.path, main.path.length);
    const p = lip.pos.clone().add({ x: 0, y: 1, z: -1 } as never);
    t.update(p);
    expect(t.piece).toBe(lower);
    expect(t.height).toBeGreaterThan(2);
    expect(t.height).toBeLessThan(4);
  });

  it('a ball in the air tracks the nearest platform under it, not the one it was over first', () => {
    // A third piece 12 m under the lower one, overlapping it from above.
    const stacked = buildLevel({
      ...twoPieces,
      pieces: [...twoPieces.pieces!, { id: 'deep', from: { piece: 'lower', s: 2, dy: -12 }, segments: [straight(30, 0.04)], width: [[0, 12]] }],
    });
    const [, low, deep] = stacked.pieces;
    const t = new PathTracker(stacked);
    // Falling 5 m over the deep piece: it is the only thing below.
    const fd = pathAt(deep.path, 20);
    t.reset(20, deep);
    t.update(fd.pos.clone().add({ x: 0, y: 5, z: 0 } as never));
    expect(t.piece).toBe(deep);
    // Higher up, still over deep but now 1.5 m over the lower piece: the lower piece is nearer.
    const fl = pathAt(low.path, 20);
    t.update(fl.pos.clone().add({ x: 0, y: 1.5, z: 0 } as never));
    expect(t.piece).toBe(low);
    expect(t.height).toBeCloseTo(1.5, 0);
  });
});

describe('piece rules', () => {
  it('flag unknown or later parents, reused ids, two finishes and starts off the parent', () => {
    const bad: LevelDef = {
      ...twoPieces,
      pieces: [
        { id: 'a', from: { piece: 'b', s: 5 }, segments: [straight(10)], width: [[0, 8]] }, // b comes later
        { id: 'b', from: { piece: 'main', s: 80 }, segments: [straight(10)], width: [[0, 8]], finish: true }, // past main's end
        { id: 'main', from: { piece: 'main', s: 5 }, segments: [straight(10)], width: [[0, 8]] },
        { id: 'c', from: { piece: 'nowhere', s: 5 }, segments: [], width: [[0, 8]], finish: true },
      ],
    };
    const problems = pieceProblems(bad).join('\n');
    expect(problems).toMatch(/2 pieces have the finish/);
    expect(problems).toMatch(/piece "a" starts from "b", which is not 'main' or an earlier piece/);
    expect(problems).toMatch(/piece "b" starts at s 80, outside "main"/);
    expect(problems).toMatch(/piece "main": the id is already used/);
    expect(problems).toMatch(/piece "c" starts from "nowhere"/);
    expect(problems).toMatch(/piece "c" has no segments/);
  });

  it('flag two pieces overlapping close together away from where they join', () => {
    const level = buildLevel({
      ...twoPieces,
      // Starts 25 m back along the main route, only 3 m below it: it runs under the main route.
      pieces: [{ ...twoPieces.pieces![0], from: { piece: 'main', s: 3, dy: -3 } }],
    });
    expect(overlapProblems(level).join('\n')).toMatch(/main s \d+ and lower s \d+ overlap only 3\.\d m apart/);
  });
});

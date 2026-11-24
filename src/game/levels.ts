import { coinLine, coinRow, coinSpots, type CoinSpot } from './coins';
import type { LevelDef } from './level';
import { left, right, straight, trackLength } from './path';
import { dropTo } from './drops';
import { forkBranch, swing } from './forks';
import { boostPad, musicTiles } from './surfaces';

/** Coin spots on a ring of `radius` around (s, u), at the given angles (0° = straight ahead, 90° = right). */
const coinRing = (s: number, u: number, radius: number, degrees: number[]): CoinSpot[] =>
  degrees.map((d) => {
    const a = (d * Math.PI) / 180;
    return { s: s + radius * Math.cos(a), u: u + radius * Math.sin(a) };
  });

/**
 * Level catalog: world 1, "Basics". Each level has one hook (see docs/level-design-guide.md):
 * a tutorial, curves, hills, a canyon, islands, steps, a slalom and an overpass. Difficulty
 * stays gentle; what changes is the feeling. Distances are meters measured from the end of
 * the flat entrance pad; positive lateral offsets (u) are to the right of the direction of travel.
 */
const degAcos = (x: number) => (Math.acos(x) * 180) / Math.PI;

// ---------------------------------------------------------------- tangled levels
// Two long "adventure" levels built from track pieces: ways that fork, cross over and under
// each other at different heights (always 8 m+ apart), drop, and meet again. The numbers are
// worked out so every junction lines up exactly; see docs/level-design-guide.md §7.1/§7.2.

// 14, Twisted Braid: the main way drops twice early (low) while the other way stays high on a
// sky bridge; they cross in an X (9 m apart); then the other way drops twice and merges back.
// Both ways are mirror images, and every drop is on a forward-facing straight, so the merge
// lines up to the millimeter.
const BR_R1 = 14;
const BR_H1 = 9; // each way swings out 9 m
const BR_T1 = degAcos(1 - BR_H1 / (2 * BR_R1));
const BR_R2 = 18;
const BR_T2 = degAcos(1 - (2 * BR_H1) / (2 * BR_R2)); // cross from +9 to -9
const BR_GS = 0.03; // the straights carrying the drops
const braidMain = [straight(18, 0.05), straight(14, 0), right(BR_T1, BR_R1, 0), left(BR_T1, BR_R1, 0.06), straight(6, BR_GS)];
const braidA3 = [straight(15.5, BR_GS), left(BR_T2, BR_R2, 0), right(BR_T2, BR_R2, 0), straight(34, 0), right(BR_T1, BR_R1, 0.06), left(BR_T1, BR_R1, 0)];
const braidMergeAt = trackLength(braidA3);
const braidB1 = [left(BR_T1, BR_R1, 0), right(BR_T1, BR_R1, 0.06), straight(34, 0), right(BR_T2, BR_R2, 0), left(BR_T2, BR_R2, 0), straight(6, BR_GS)];
const braidB3 = [straight(15.5, BR_GS), left(BR_T1, BR_R1, 0.06), right(BR_T1, BR_R1, 0)];
const braidS2 = trackLength(braidA3.slice(0, 3));

const twistedBraid: LevelDef = {
  id: 14,
  name: 'Twisted Braid',
  tagline: 'Two ways twist over and under each other. Pick one!',
  grade: 0.05,
  segments: braidMain,
  width: [
    [0, 8],
    [24, 10],
    [34, 8],
    [52, 8],
    [57, 6],
  ],
  checkpoints: [25],
  coins: [
    ...coinRow(3, 4, 2.5),
    ...coinSpots([
      [27.5, -2.5],
      [27.5, 2.5],
      [30, -3],
      [30, 3],
    ]),
  ],
  pieces: [
    // The main way: two drops on its straight, so it is low when the ways cross.
    dropTo('a2', { from: 'main', lip: trackLength(braidMain), height: 4 }, { segments: [straight(15.5, BR_GS)], width: [[0, 9]], coins: coinRow(4, 4, 2.2) }),
    dropTo('a3', { from: 'a2', lip: 15.5, height: 4 }, {
      segments: [...braidA3, straight(14, 0), straight(16, 0.02), straight(14, 0.05)],
      width: [
        [0, 13.5],
        [16, 13.5],
        [22, 8],
        [braidMergeAt - 2, 8],
        [braidMergeAt + 6, 10],
      ],
      coins: [...coinRow(4, 4, 2.2), ...coinRow(braidS2 + 6, 5, 4), ...coinRow(braidMergeAt + 4, 3, 2.5), ...coinLine(braidMergeAt + 34, -2, braidMergeAt + 42, 2, 3)],
      surfaces: [boostPad(braidS2 + 0.5)],
      checkpoints: [braidS2 + 14],
      finish: true,
    }),
    // The other way: a high, level sky bridge with music keys, over the main way, then its drops.
    {
      id: 'b1',
      from: { piece: 'main', s: 32 },
      segments: braidB1,
      width: [
        [0, 8],
        [trackLength(braidB1) - 10, 8],
        [trackLength(braidB1) - 5, 6],
      ],
      coins: coinRow(46, 3, 3),
      checkpoints: [40],
      surfaces: musicTiles(24.5, 2.2, ['G5', 'A5', 'B5', 'C6', 'D6', 'E6']),
    },
    dropTo('b2', { from: 'b1', lip: trackLength(braidB1), height: 4 }, { segments: [straight(15.5, BR_GS)], width: [[0, 9]], coins: coinRow(4, 4, 2.2) }),
    {
      ...dropTo('b3', { from: 'b2', lip: 15.5, height: 4 }, {
        segments: braidB3,
        width: [
          [0, 13.5],
          [16, 13.5],
          [22, 8],
        ],
        coins: coinRow(4, 3, 2.2),
      }),
      to: { piece: 'a3', s: braidMergeAt },
    },
  ],
  theme: {
    tileA: '#4c1d95',
    tileB: '#c4b5fd',
    side: '#1e0b3a',
    rim: '#fde047',
    skyTop: '#0b0820',
    horizon: '#f472b6',
  },
};

// 15, Spaghetti Junction: the main way loops down and passes under its own start (8 m+ below);
// the high road crosses over it (10 m+ above), steps down twice on the far side and lands
// beside the main way's lip: both ways drop into one wide pool (a double waterfall).
const spagMain = [
  straight(18, 0.05),
  straight(14, 0),
  right(BR_T1, BR_R1, 0),
  right(270, 16, 0.11),
  straight(30, 0.08),
  right(43, 20, 0.04),
  straight(84, 0.015),
];
const spagFinal = trackLength(spagMain.slice(0, 6));
const spagHigh = [left(BR_T1, BR_R1, 0), straight(34, 0.02), right(BR_T1, 20, 0.02), straight(6, 0.02), straight(6, 0.03)];
const spagT4 = degAcos(1 - 7 / (2 * BR_R1));
const spagHigh3 = [straight(15.5, 0.03), right(spagT4, BR_R1, 0.06), left(spagT4, BR_R1, 0.06), straight(6, 0.02)];
const spagPool = dropTo('pool', { from: 'main', lip: trackLength(spagMain), height: 2.5 }, {
  segments: [straight(50, 0.02)],
  width: [[0, 14]],
  coins: [...coinRow(12, 4, 2.5, 3.5), ...coinRow(12, 4, 2.5, -3.5), ...coinLine(38, -2, 46, 2, 3)],
  finish: true,
});
spagPool.from.u = -3.5; // shifted left, so the high road's lip lands on it beside the main way's lip
const spaghettiJunction: LevelDef = {
  id: 15,
  name: 'Spaghetti Junction',
  tagline: 'Loops, bridges and waterfalls. Every way meets at the pool!',
  grade: 0.05,
  segments: spagMain,
  width: [
    [0, 8],
    [24, 10],
    [36, 8],
    [trackLength(spagMain) - 14, 8],
    [trackLength(spagMain) - 8, 6],
  ],
  checkpoints: [25, spagFinal + 30],
  coins: [
    ...coinRow(3, 4, 2.5),
    ...coinRow(52, 6, 4, 1.8),
    ...coinRow(spagFinal + 8, 4, 2.5),
    ...coinRow(spagFinal + 52, 4, 3),
  ],
  surfaces: [
    boostPad(trackLength(spagMain.slice(0, 4)) + 0.5),
    ...musicTiles(spagFinal + 38, 2, ['C5', 'D5', 'E5', 'G5', 'E5', 'G5', 'C6']),
  ],
  pieces: [
    spagPool,
    { id: 'high', from: { piece: 'main', s: 32 }, segments: spagHigh, width: [[0, 8], [trackLength(spagHigh) - 8, 6]], coins: coinRow(14, 5, 4) },
    dropTo('high2', { from: 'high', lip: trackLength(spagHigh), height: 4 }, { segments: [straight(15.5, 0.03)], width: [[0, 9]], checkpoints: [7], coins: coinRow(3, 2, 2.5) }),
    {
      ...dropTo('high3', { from: 'high2', lip: 15.5, height: 4 }, { segments: spagHigh3, width: [[0, 13.5], [15.5, 13.5], [21, 6]], coins: coinRow(4, 4, 2.2) }),
      dropOnto: 'pool',
    },
  ],
  theme: {
    tileA: '#ea580c',
    tileB: '#fde68a',
    side: '#431407',
    rim: '#fef3c7',
    skyTop: '#0c1324',
    horizon: '#38bdf8',
  },
};

export const LEVELS: LevelDef[] = [
  {
    // Tutorial. Hook: steer and collect. A long, wide, gentle slope with one slight bend;
    // coins teach "roll through me", then "steer right", "steer left", "hug the inside".
    id: 1,
    name: 'First Roll',
    tagline: 'Touch to steer. Roll through the coins!',
    grade: 0.07,
    segments: [straight(36, 0.05), left(25, 60), straight(34, 0.09)],
    width: [[0, 10]],
    coins: [
      ...coinRow(3, 6, 2),
      ...coinLine(18, 0.5, 28, 3, 5),
      ...coinLine(31, 2.5, 39, -2, 5),
      ...coinRow(43, 6, 3, -2),
      ...coinRow(65, 5, 2.5),
      ...coinLine(80, -2.5, 92, 2.5, 5),
    ],
    theme: {
      tileA: '#3b82f6',
      tileB: '#93c5fd',
      side: '#1e3a8a',
      rim: '#e0f2fe',
      skyTop: '#0b1a3a',
      horizon: '#5b8bd6',
    },
  },
  {
    // Flow. Hook: big, lazy S-bends (the first real curves). The river widens into a
    // lake on the last bend; coins ride the inside of every curve.
    id: 2,
    name: 'Lazy River',
    tagline: 'Swing through big, lazy bends.',
    grade: 0.05,
    segments: [
      straight(10),
      left(55, 18),
      straight(6, 0.02),
      right(100, 15),
      left(100, 15),
      right(45, 18),
      straight(10, 0.07),
    ],
    width: [
      [0, 9],
      [14, 8],
      [82, 8],
      [90, 10],
    ],
    coins: [
      ...coinRow(2, 4, 2),
      ...coinRow(12, 5, 3, -1.8),
      ...coinLine(27.5, -1, 32, 1, 3),
      ...coinRow(36, 7, 3.4, 1.8),
      ...coinRow(62, 7, 3.4, -1.8),
      ...coinRow(88, 4, 3, 2),
      ...coinRow(101, 4, 2.5),
    ],
    theme: {
      tileA: '#14b8a6',
      tileB: '#ccfbf1',
      side: '#134e4a',
      rim: '#f0fdfa',
      skyTop: '#042f2e',
      horizon: '#3a9e98',
    },
  },
  {
    // Rush. Hook: hills (the first climbs). Drops and short rises on a wide straight make
    // the ball surge and float; a camel hump leads to the big drop, then a sweeping bend home.
    id: 3,
    name: 'Roller Coaster',
    tagline: 'Up, down, whoosh! Ride the hills.',
    grade: 0.08,
    segments: [
      straight(15, 0.08),
      straight(6, -0.04),
      straight(10, 0.1),
      straight(7, -0.06),
      straight(10, 0.11),
      straight(14, -0.07),
      straight(6, 0),
      straight(12, 0.14),
      straight(10, 0.04),
      right(45, 24, 0.06),
    ],
    width: [[0, 9]],
    coins: [
      ...coinRow(3, 5, 2.5),
      ...coinRow(16.5, 3, 2, 1.5),
      ...coinRow(23, 4, 2.4),
      ...coinRow(32.5, 3, 2, -1.5),
      ...coinRow(39.5, 4, 2.4),
      ...coinLine(50, 1.5, 60, -1.5, 5),
      ...coinSpots([
        [64, 0],
        [66.5, 0],
      ]),
      ...coinRow(70, 5, 2.4),
      ...coinRow(83, 3, 2.5),
      ...coinRow(92, 5, 3.2, 1.8),
    ],
    theme: {
      tileA: '#f472b6',
      tileB: '#fef08a',
      side: '#9d174d',
      rim: '#ffffff',
      skyTop: '#0b2a5e',
      horizon: '#7cb8f0',
    },
  },
  {
    // Surprise. Hook: width changes. Plaza, funnel, chute, plaza, twice; each chute opens
    // into a wider plaza around a bend. The second chute (4.5 m, 7 m long) is the one spicy bit.
    id: 4,
    name: 'Canyon',
    tagline: 'Squeeze through the gaps into wide open plazas.',
    grade: 0.07,
    segments: [
      straight(14, 0.04),
      straight(16, 0.08),
      left(50, 18, 0.03),
      straight(18, 0.07),
      right(45, 20, 0.03),
      straight(16, 0.07),
    ],
    width: [
      [0, 11],
      [12, 11],
      [19, 5.5],
      [29, 5.5],
      [35, 11],
      [46, 11],
      [53, 4.5],
      [60, 4.5],
      [66, 12],
      [82, 12],
      [92, 9],
    ],
    coins: [
      ...coinRow(2, 2, 2),
      // A "V" that funnels into the first chute.
      ...coinSpots([
        [8, -3],
        [8, 3],
        [10.5, -1.5],
        [10.5, 1.5],
        [13, 0],
      ]),
      ...coinRow(16, 6, 2.4),
      ...coinRow(32, 4, 3, -2.5),
      ...coinRow(33.5, 3, 3.5, 2.5),
      ...coinRow(48, 6, 2.4),
      ...coinRow(64, 5, 3, 2.5),
      ...coinRow(66.5, 3, 3.5, -2.5),
      ...coinLine(82, -2, 92, 2, 5),
    ],
    theme: {
      tileA: '#b45309',
      tileB: '#fcd9a8',
      side: '#5a2a0a',
      rim: '#fff7ed',
      skyTop: '#1b2b4a',
      horizon: '#9db8d8',
    },
  },
  {
    // Choice. Hook: islands (the first holes). Big round holes in wide plazas: go left or
    // right, both ways pay. The first island is centered, the second leaves a wide way on the
    // right, and the last plaza has two islands so the wide way flips sides.
    id: 5,
    name: 'Roundabout',
    tagline: 'Big holes ahead. Go left or right, your choice!',
    grade: 0.06,
    segments: [
      straight(8, 0.04),
      straight(20, 0.03),
      left(40, 20, 0.06),
      straight(20, 0.03),
      right(40, 20, 0.06),
      straight(20, 0.03),
      straight(14, 0.07),
    ],
    width: [
      [0, 8],
      [4, 8],
      [11, 13],
      [25, 13],
      [31, 8],
      [38, 8],
      [45, 13],
      [59, 13],
      [65, 8],
      [72, 8],
      [79, 13],
      [94, 13],
      [102, 9],
    ],
    holes: [
      { s: 18, u: 0, r: 2.2 },
      { s: 52, u: -1.6, r: 2.2 },
      { s: 82, u: 1.6, r: 1.8 },
      { s: 90, u: -1.6, r: 1.8 },
    ],
    // Rings around the islands so both ways round pay; each spot is ≥ 1.1 m from every rim.
    coins: [
      ...coinRow(3, 3, 2),
      ...coinRing(18, 0, 3.6, [-135, -90, -45, 45, 90, 135]),
      ...coinRow(30, 4, 3, -1.5),
      ...coinRing(52, -1.6, 3.5, [-135, -90, -45, 45, 90, 135]),
      ...coinRow(64, 4, 3, 1.5),
      // Last plaza: the weaving line (left of the first island, right of the second)…
      ...coinSpots([
        [78.5, 0],
        [81, -2.1],
        [83.5, -2.1],
        [86, 0],
        [88.5, 2.2],
        [91, 2.2],
        [93.5, 1],
      ]),
      // …and the other way round both islands.
      ...coinSpots([
        [81, 4.5],
        [83.5, 4.5],
        [88.5, -4.4],
        [91, -4.5],
      ]),
      ...coinRow(98, 4, 3),
    ],
    theme: {
      tileA: '#4d7c0f',
      tileB: '#bef264',
      side: '#1a2e05',
      rim: '#fefce8',
      skyTop: '#0b2010',
      horizon: '#d4a84a',
    },
  },
  {
    // Effort and reward. Hook: steps up. Three short climbs with flat terraces between them
    // lead to a wide, flat lookout, then a long swoop down to the finish.
    id: 6,
    name: 'Lookout',
    tagline: 'Climb the steps to the top, then swoop down.',
    grade: 0.1,
    segments: [
      straight(15, 0.06),
      straight(5, 0),
      straight(9, -0.08),
      straight(7, 0),
      straight(9, -0.08),
      straight(7, 0),
      straight(9, -0.1),
      straight(4, 0),
      left(45, 14, 0),
      right(75, 20, 0.1),
      straight(8, 0.06),
    ],
    width: [
      [0, 8],
      [57, 8],
      [63, 11],
      [77, 11],
      [85, 8],
    ],
    coins: [
      ...coinRow(3, 5, 2.5),
      ...coinRow(21, 3, 3),
      ...coinSpots([
        [31, -2],
        [34, 2],
      ]),
      ...coinRow(37, 3, 3),
      ...coinSpots([
        [47, 2],
        [50, -2],
      ]),
      ...coinRow(53, 3, 3),
      // Treasure on the lookout.
      ...coinRow(63, 5, 3, -2.5),
      ...coinRow(64.5, 4, 3, 2.5),
      ...coinRow(79, 7, 3.3, 1.8),
      ...coinRow(103, 3, 2.5),
    ],
    theme: {
      tileA: '#f97316',
      tileB: '#d8b4fe',
      side: '#7c2d12',
      rim: '#fff7ed',
      skyTop: '#1e0b3a',
      horizon: '#e879a9',
    },
  },
  {
    // Light precision. Hook: slalom. Notches cut into alternate edges of a gently winding
    // run, so the ball sways like a skier; then two "ski gates" to roll straight through.
    id: 7,
    name: 'Slalom',
    tagline: 'Swish left, swish right, like a skier.',
    grade: 0.07,
    segments: [straight(14, 0.06), left(25, 40), right(50, 40), left(25, 40), straight(18, 0.05)],
    width: [
      [0, 8],
      [8, 7],
      [80, 7],
      [88, 9],
    ],
    holes: [
      { s: 12, u: 2.6, r: 1.1 },
      { s: 20, u: -2.6, r: 1.1 },
      { s: 28, u: 2.6, r: 1.1 },
      { s: 34, u: -2.6, r: 1.1 },
      { s: 40, u: 2.6, r: 1.1 },
      { s: 46, u: -2.6, r: 1.1 },
      { s: 52, u: 2.6, r: 1.1 },
      { s: 58, u: -2.6, r: 1.1 },
      // Ski gates: a notch on both sides, 3.8 m clear between them.
      { s: 68, u: -2.9, r: 1.0 },
      { s: 68, u: 2.9, r: 1.0 },
      { s: 76, u: -2.9, r: 1.0 },
      { s: 76, u: 2.9, r: 1.0 },
    ],
    // The swaying line: opposite each notch, ≥ 2.8 m from its rim; then through the gates.
    coins: [
      ...coinRow(2, 3, 2.5),
      ...coinSpots([
        [10, -0.6],
        [12.5, -1.3],
        [16, 0],
        [19.5, 1.3],
        [22, 0.6],
        [28, -1.3],
        [31, 0],
        [34, 1.3],
        [40, -1.3],
        [43, 0],
        [46, 1.3],
        [52, -1.3],
        [55, 0],
        [58, 1.3],
      ]),
      ...coinRow(64, 7, 2.2),
      ...coinLine(82, -2, 96, 2, 5),
    ],
    theme: {
      tileA: '#93c5fd',
      tileB: '#f8fafc',
      side: '#1e3a8a',
      rim: '#fb7185',
      skyTop: '#0f172a',
      horizon: '#7891c4',
    },
  },
  {
    // Wonder. Hook: an overpass. The route loops three-quarters of the way round and rolls
    // under the bridge you started on (about 10 m below it), then runs home.
    id: 8,
    name: 'Overpass',
    tagline: 'Loop around and roll under the bridge.',
    grade: 0.1,
    segments: [straight(16, 0.09), right(270, 14, 0.12), straight(14, 0.11), straight(14, 0.06)],
    width: [[0, 9]],
    coins: [
      ...coinRow(3, 5, 2.5),
      ...coinRow(19, 5, 3.5, 2),
      ...coinRow(40, 5, 3.5, 2),
      ...coinRow(61, 5, 3.5, 2),
      ...coinRow(84, 5, 2.5),
      ...coinLine(98, -2, 107, 2, 4),
    ],
    theme: {
      tileA: '#1e3a8a',
      tileB: '#4f46e5',
      side: '#0b1023',
      rim: '#22d3ee',
      skyTop: '#02030a',
      horizon: '#1f2a52',
    },
  },
  {
    // Adventure (world 1 showcase). Hook: checkpoints. A long tour through earlier ideas:
    // an island roundabout, roller-coaster hills, a flat lookout, slalom notches on a bend,
    // then a sweeping run home. Three glowing gates save the spot, each on a calm rest area
    // with a couple of "welcome back" coins just after it.
    id: 9,
    name: 'Grand Tour',
    tagline: 'A big adventure. Glowing gates save your spot!',
    grade: 0.06,
    segments: [
      straight(16, 0.05),
      straight(20, 0.03),
      left(40, 22, 0.06),
      straight(16, 0.02),
      straight(10, 0.1),
      straight(7, -0.06),
      straight(10, 0.11),
      straight(7, -0.06),
      straight(14, 0),
      right(60, 22, 0.06),
      straight(14, 0.03),
      left(45, 24, 0.07),
      straight(10, 0.06),
    ],
    width: [
      [0, 9],
      [10, 9],
      [16, 13],
      [34, 13],
      [42, 8],
      [64, 8],
      [68, 9],
      [113, 9],
      [118, 8],
      [137, 8],
      [141, 10],
    ],
    holes: [
      { s: 26, u: 0, r: 2.2 },
      { s: 122, u: 3.1, r: 1.1 },
      { s: 128, u: -3.1, r: 1.1 },
      { s: 134, u: 3.1, r: 1.1 },
    ],
    checkpoints: [58, 108, 145],
    coins: [
      ...coinRow(3, 3, 2.5),
      ...coinRing(26, 0, 3.6, [-135, -90, -45, 45, 90, 135]),
      ...coinRow(40, 3, 4, -1.8),
      ...coinRow(60.5, 2, 2.5),
      ...coinRow(69, 3, 2.6),
      ...coinLine(79, -1.2, 82, 1.2, 2),
      ...coinRow(86.5, 3, 2.6),
      ...coinRow(110.5, 2, 2.5),
      // Slalom: opposite each notch.
      ...coinSpots([
        [122, -1.4],
        [125, 0],
        [128, 1.4],
        [131, 0],
        [134, -1.4],
      ]),
      ...coinRow(147.5, 2, 2.5),
      ...coinRow(156, 4, 3.5, -2),
      ...coinLine(172, -2, 179, 2, 3),
    ],
    theme: {
      tileA: '#7c3aed',
      tileB: '#fde68a',
      side: '#2e1065',
      rim: '#fef3c7',
      skyTop: '#120a2e',
      horizon: '#6d8fd6',
    },
  },  {
    // Play. Hook: music tiles. Every colored tile plays a note when the ball rolls onto it.
    // Meet: five big keys across the whole track. Play: three lanes; the middle one (the
    // coin line) plays "Twinkle Twinkle Little Star", the side lanes play it an octave lower.
    // Twist: a curve of short keys climbing a scale as the ball speeds up. Celebrate: a ta-da.
    id: 10,
    name: 'Musical Bridge',
    tagline: 'Every tile plays a note. Can you find the song?',
    grade: 0.04,
    segments: [
      straight(10, 0.04),
      straight(16, 0.03),
      straight(32, 0.03),
      left(60, 20, 0.04),
      straight(10, 0.02),
      straight(14, 0.06),
    ],
    width: [[0, 9.4]],
    surfaces: [
      ...musicTiles(12, 2.6, ['C5', 'D5', 'E5', 'G5', 'A5']),
      ...musicTiles(29, 2, ['C5', 'C5', 'G5', 'G5', 'A5', 'A5', 'G5', 'F5', 'F5', 'E5', 'E5', 'D5', 'D5', 'C5'], -1.4, 1.4),
      ...musicTiles(29, 2, ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'], -4.2, -1.5),
      ...musicTiles(29, 2, ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'], 1.5, 4.2),
      ...musicTiles(60, 1.5, ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7']),
      ...musicTiles(89.5, 3, ['C5', 'E5', 'G5', 'C6']),
    ],
    coins: [
      ...coinRow(3, 3, 2.5),
      ...coinRow(13.3, 5, 2.6),
      ...coinRow(30, 7, 4),
      ...coinRow(61, 5, 3.4, -1.8),
      ...coinRow(81, 3, 2.5),
      ...coinRow(91, 4, 3),
    ],
    theme: {
      tileA: '#1e1b4b',
      tileB: '#4338ca',
      side: '#0f0a2e',
      rim: '#f0abfc',
      skyTop: '#07051a',
      horizon: '#3b3a7a',
    },
  },
  {
    // Rush. Hook: boost arrows. Meet: one pad on the flat (whoosh, then coast). Play: a pad
    // right before a hill, so the ball flies up it. Twist: a choice of lanes, boost on the
    // left or coins on the right, into a big sweeping bend. Celebrate: a boost to the finish.
    id: 11,
    name: 'Zoom Zoom',
    tagline: 'Roll over the orange arrows. Whoosh!',
    grade: 0.04,
    segments: [
      straight(12, 0.03),
      straight(14, 0.02),
      straight(8, 0.02),
      straight(12, -0.08),
      straight(9, 0),
      straight(10, 0.08),
      straight(14, 0.02),
      right(55, 22, 0.04),
      straight(12, 0.04),
    ],
    width: [[0, 9]],
    surfaces: [boostPad(14), boostPad(27), boostPad(66, 4, -4.3, 0), boostPad(101)],
    coins: [
      ...coinRow(3, 3, 2.5),
      ...coinRow(19.5, 3, 2.5),
      ...coinRow(36, 4, 3),
      ...coinRow(48, 3, 2.5),
      ...coinLine(57, -2, 63, 2, 3),
      ...coinRow(66, 4, 3, 2.2),
      ...coinRow(71.5, 2, 2.5, -2.2),
      ...coinRow(82, 5, 3.6, 1.8),
      ...coinRow(106, 3, 2.2),
    ],
    theme: {
      tileA: '#3f3f46',
      tileB: '#a1a1aa',
      side: '#18181b',
      rim: '#facc15',
      skyTop: '#0c1b33',
      horizon: '#f59e0b',
    },
  },  {
    // Surprise. Hook: drops. The track ends at a glowing lip and the ball sails down onto a
    // wider step below: 1.5 m, then 2.5 m, then 3.5 m. Each landing step starts under the lip,
    // so every speed lands; each bends a little and ends in a straight launch pad.
    id: 12,
    name: 'Waterfall Steps',
    tagline: 'Roll off the edge and land on the step below. Whee!',
    grade: 0.05,
    segments: [straight(14, 0.06), straight(6, 0.02)],
    width: [[0, 8]],
    coins: [...coinRow(3, 4, 2.5), ...coinRow(15, 2, 2)],
    pieces: [
      dropTo(
        'step1',
        { from: 'main', lip: 20, height: 1.5 },
        {
          segments: [straight(13, 0.03), left(35, 24, 0.06), straight(6, 0.02)],
          width: [
            [0, 12],
            [12, 12],
            [17, 9],
          ],
          coins: [...coinRow(4, 4, 2.2), ...coinRow(15, 4, 3, -1.8), ...coinRow(29, 2, 2)],
        },
      ),
      dropTo(
        'step2',
        { from: 'step1', lip: 33.66, height: 2.5 },
        {
          segments: [straight(14, 0.03), right(35, 24, 0.06), straight(6, 0.02)],
          width: [
            [0, 13.5],
            [13.5, 13.5],
            [19, 9],
          ],
          coins: [...coinRow(4.5, 4, 2.2), ...coinRow(16, 4, 3, 1.8), ...coinRow(30, 2, 2)],
        },
      ),
      dropTo(
        'step3',
        { from: 'step2', lip: 34.66, height: 3.5 },
        {
          segments: [straight(16, 0.03), straight(10, 0.05)],
          width: [
            [0, 13.5],
            [15, 13.5],
            [22, 10],
          ],
          coins: [...coinRow(5, 5, 2.2), ...coinLine(18, -2, 24, 2, 3)],
          finish: true,
        },
      ),
    ],
    theme: {
      tileA: '#0891b2',
      tileB: '#a5f3fc',
      side: '#164e63',
      rim: '#ecfeff',
      skyTop: '#082f49',
      horizon: '#60a5fa',
    },
  },  {
    // Choice. Hook: a real fork. After a wide, flat fork area the route splits: the right way
    // (the main route) is a coin trail, the left way (a branch) plays music keys. They run
    // 10 m apart and meet again, then a run home. Both ways are the same length.
    id: 13,
    name: 'Two Paths',
    tagline: 'Left or right? Both ways meet again.',
    grade: 0.05,
    segments: [
      straight(12, 0.05),
      straight(6, 0),
      ...swing('right', 9, 14, 8, 0.06),
      straight(8, 0),
      straight(16, 0.06),
    ],
    width: [
      [0, 8],
      [10, 10],
      [24, 8],
      [70, 8],
      [78, 10],
      [96, 9],
    ],
    coins: [
      ...coinRow(3, 4, 2.5),
      // Both ways shown at the fork.
      ...coinSpots([
        [13, -2.5],
        [13, 2.5],
        [15.5, -3.5],
        [15.5, 3.5],
      ]),
      ...coinRow(32, 8, 3),
      ...coinRow(76, 3, 2.5),
      ...coinLine(84, -2, 92, 2, 3),
    ],
    pieces: [
      forkBranch(
        'left',
        { at: 18, side: 'left', offset: 9, radius: 14, middle: 8, grade: 0.06 },
        {
          width: [[0, 8]],
          coins: [...coinRow(14, 3, 3), ...coinRow(38, 3, 3)],
          surfaces: musicTiles(23.5, 2, ['C5', 'E5', 'G5', 'C6']),
        },
      ),
    ],
    theme: {
      tileA: '#be123c',
      tileB: '#fecdd3',
      side: '#4c0519',
      rim: '#fff1f2',
      skyTop: '#1a0b14',
      horizon: '#f59e0b',
    },
  },
  twistedBraid,
  spaghettiJunction,
];

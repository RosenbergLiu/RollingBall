# Rolling Ball: Level Design Guide

Written for an AI (or a person) creating new levels. Read it all before designing.
It covers what makes a good Rolling Ball level, the numbers the engine can handle, and
how to deliver and check a level. It also has a list of ideas, from ones you can build
today to ones that need new engine features.

> **The one rule:** every level should feel *new*, not *harder*. A player should finish a
> level thinking "that was cool, what's next?", not "phew, finally". Change what the
> player sees and feels; keep how much skill it takes roughly level and gentle.

---

## 1. The game in one paragraph

A steel ball rolls along a floating, fence-less platform. The route can go downhill, run
flat or climb gently, in any mix. The camera follows behind it and
the ball stays in the center of the screen. While a finger is on the screen, the ball is
pushed toward the finger, harder the farther the finger is from the center. Falling off an
edge or into a hole is **Game Over**, and the ball respawns at the entrance of the level, or
at the last checkpoint gate it passed (§7.10).
Coins float along the route, and touching one collects it into the player's wallet (shown
on the main menu). Reaching the checkered finish line wins. Levels unlock one by one. The audience is young
and plays on an iPad, so design for kids and for a touchscreen.

---

## 2. Design philosophy: freshness over difficulty

### 2.1 One hook per level
Each level is built around **one new idea**, its *hook*: a fork, a big drop, a musical
bridge, an ice rink. The hook goes through four beats (a classic structure for small
game levels):

| Beat | Share of the level | What happens |
|---|---|---|
| **Meet** | ~20 % | Show the hook somewhere safe: wide, flat, slow. Nobody fails here. |
| **Play** | ~40 % | Two or three variations of the hook, each a little different. |
| **Twist** | ~25 % | The surprising version: same hook, new angle (reversed, combined with scenery, seen from a new viewpoint). Surprising, *not* harder. |
| **Celebrate** | ~15 % | A wide, easy, fast run to the finish. Ending on a high, never on the hardest bit. |

### 2.2 Vary the *feeling*, not the punishment
Rotate through these feelings across the catalog. Two levels in a row should not have the
same main feeling.

- **Rush**: long downhill straights and big sweeping curves. Speed is the fun.
- **Flow**: rhythmic S-curves or rolling hills (down, up, down); the player finds a swing.
- **Calm**: wide, flat or gently sloped, and scenic. A breather after something busy.
- **Effort and reward**: a gentle climb to a flat lookout, then a swoop down.
- **Choice**: forks, lanes around an island, picking a line through holes.
- **Surprise**: a drop to a new platform, a reveal around a corner, a big landmark.
- **Precision (light)**: a short narrow bridge *with rest areas on both sides*. Never long.
- **Play**: things to interact with: pins to knock over, tiles that light up or make music.

### 2.3 Difficulty budget
Keep difficulty **flat and low**. Use the knobs in §4, and stay in the "comfortable"
column for most of every level. A level may use **one** "spicy" moment, and only:

- after a rest area,
- once the hook has been met safely,
- and never within the last 15 m before the finish.

**Never stack hazards.** Pick at most one of narrow, tight curve, holes or steep slope at
any spot. A hole on a narrow, tight, steep curve is exactly what this game should not do.

### 2.4 Make the next moment readable
The camera sits 9 m behind and 5.5 m above the ball. The player only sees about 15–25 m
ahead, so:

- Nothing dangerous right after a crest, a drop or the exit of a tight turn. Leave at
  least 8 m of plain platform first.
- Holes must be visible from 12 m or more away; their glowing rims do the job.
- Forks need to be visible early. Put a wide area *before* the split, and make the two
  branches look different (rim color, width, decoration).

### 2.5 Respect the player's time
A fall sends the ball back to the entrance, or to the last checkpoint it passed.
So a long stretch without a checkpoint makes a fall expensive.

- **Standard levels:** **25–45 seconds** of play for a typical child (about 50–110 m of
  authored path at the current speeds). Flat and climbing sections are slower than downhill,
  so shorten the route when a level has a lot of them. No checkpoint needed.
- **Adventure levels:** up to about **90 seconds**, with a checkpoint every **20–30 seconds**
  of play (§7.10). Use them for "tour" levels that chain several ideas together. Keep them
  rare (about one per world) so most levels stay short and snappy.

---

## 3. What the engine supports today

Levels live in `src/game/levels.ts` as `LevelDef` objects (`src/game/level.ts`).

```ts
{
  id: 9,                          // sequential; see §6.4 (never renumber existing levels)
  name: 'Lazy River',
  tagline: 'Just enjoy the ride.', // one short line on the level card
  grade: 0.09,                    // default slope, drop per horizontal meter: + down, 0 flat, − up
  segments: [                     // the centerline, built like a turtle
    straight(12),                 // length in m, optional own grade: straight(10, 0.15)
    left(60, 16),                 // angle in degrees, radius in m, optional grade
    right(120, 14),
    straight(15, -0.06),          // a gentle climb (negative grade = uphill)
    straight(10, 0),              // flat
    straight(20, 0.04),
  ],
  width: [[0, 8], [30, 6], [60, 9]],   // [s, width] keyframes, smoothstep between them
  holes: [{ s: 40, u: -1.5, r: 1.2 }], // s along the path, u sideways (+ = right), radius
  coins: [                             // REQUIRED: designated coin spots (see §5.8)
    ...coinRow(4, 5, 2),               // 5 spots down the middle, 2 m apart
    ...coinLine(20, -2, 30, 2, 5),     // a diagonal line from (s 20, u -2) to (s 30, u 2)
    ...coinSpots([[44, 1.5], [47, 0.5], [50, -0.5]]),   // explicit [s, u] spots
  ],
  checkpoints: [55, 105],              // OPTIONAL, adventure levels only: gates at these s (§7.10)
  surfaces: [                          // OPTIONAL: boost arrows and music tiles (§7.3)
    boostPad(30),                      // a 4 m pad of forward-pushing arrows, full width
    ...musicTiles(40, 2, ['C5', 'E5', 'G5'], -1.5, 1.5), // three 2 m keys in a 3 m lane
  ],
  theme: { tileA, tileB, side, rim, skyTop, horizon },   // hex colors
}
```

Facts about the format:

- `s` (for width keyframes and holes) counts meters from the start of the **authored**
  segments. A flat 7 m entrance pad is added automatically before them, and a flat 12 m
  run-out after them. The finish line sits 1.5 m into the run-out.
- The ball spawns 3 m into the entrance pad. Heading 0 is −Z. `left()` turns
  counter-clockwise seen from above.
- **The route does not have to go down.** Each segment's grade sets its slope: positive
  goes downhill, 0 is flat, negative climbs. Mix them freely within the limits in §4. A
  level may even end higher than it starts.
- Slope changes are smoothed over 5 m, so crests and dips blend gently.
- Width changes are smooth too, so a keyframe pair is a gentle funnel, not a step.
- Holes are circles. They can cut into an edge (a notch) or overlap each other. A chain of
  overlapping holes makes a slot with scalloped edges.
- Coin spots use the same `s`/`u` coordinates as holes. The helpers `coinRow`, `coinLine` and
  `coinSpots` come from `src/game/coins.ts`.
- **Track pieces (foundation built):** a level may add `pieces`: extra ribbons built like the
  main route (`segments`, `width`, `holes`, `coins`, `surfaces`), each starting from a point on
  `'main'` or an earlier piece: `from: { piece, s, u?, dy?, turn? }`. One piece may have
  `finish: true` (then the main route ends without a run-out). The tracker moves the ball to
  any piece it lands on; a fall means below every piece within reach. `pieceProblems()` and
  `overlapProblems()` check them. Design rules and helpers for drops (§7.2) and forks (§7.1)
  come next; until then, levels are one ribbon.
  §5 shows how to fake forks today; §7 proposes the real thing.
- The route may pass **over itself** only with a big vertical gap (as in Overpass, level 8):
  at least 8 m between the two surfaces at the crossing (checked by the tests).
- `surfaces` are painted rectangles (`s0`–`s1` along, optional `u0`–`u1` across; default the
  full width) with a behavior. Today: `boost` and `music` (§7.3). The helpers `boostPad`,
  `musicTiles` and `note` come from `src/game/surfaces.ts`; `surfaceProblems()` checks them.
- `checkpoints` lists gate positions (authored `s`, in order). Each must sit on a calm rest
  area; `checkpointProblems()` in `src/game/level.ts` checks the §7.10 rules. Grand Tour
  (level 9) is the example.

---

## 4. Numbers and limits

Numbers come from the current physics: gravity 16 m/s², ball diameter 1 m, top push
speed about 11–17 m/s, typical play speed 5–10 m/s. The **hard limit** column is enforced
by the engine or tests, or is the point where the game breaks.

| Knob | Comfortable (most of a level) | Spicy (one short moment) | Hard limit |
|---|---|---|---|
| Width | 5–10 m | 3.5–4.5 m for ≤ 15 m | ≥ 3.0 m; max width ≤ 14 m (mesh size) |
| Slope, downhill (grade > 0) | 0–0.12 | 0.13–0.18 for ≤ 20 m | ≤ 0.2 (test) |
| Slope, flat (grade 0) | any length | n/a | none; the ball only moves when pushed, which is fine |
| Slope, uphill (grade < 0) | 0 to −0.10, each climb ≤ 20 m | −0.11 to −0.16 for ≤ 12 m | ≥ −0.2 (test) |
| Slope change between neighbouring segments | ≤ 0.12 | ≤ 0.2 | ≤ 0.2, including into the flat entrance and run-out (test) |
| Climbing near the start | none in the first 15 m | n/a | none in the first 12 m (test) |
| Curve radius | ≥ 14 m | 9–13 m | ≥ 8 m, **and** radius > width/2 + 3 m |
| Hole radius | 0.8–1.4 m | 1.5–2.5 m (islands, §5.2) | 0.7–3.5 m |
| Free lane past a hole | ≥ 2.5 m | 2.0 m | ≥ 2.0 m (twice the ball) |
| Hole-free start | first 8 m of authored path | first 5 m | test: holes stay off the entrance pad |
| Hole-free finish | last 15 m before the run-out | last 8 m | test: holes end before the finish line |
| Rest area | every 25–35 m: wider (≥ 7 m) and/or flatter (≤ 0.05) for ≥ 6 m | n/a | n/a |
| Authored length | 50–110 m (no checkpoint) | up to 200 m with checkpoints | ≤ 200 m (mesh size) |
| Checkpoint spacing | one every 35–50 m of path (20–30 s of play) | n/a | ≤ 3 per level, ≥ 25 m apart |
| Hole circles per level | 0–14 (a hole chain counts each circle) | up to 30 | ≤ 40 |
| Self-overlap | none | spiral with ≥ 9 m vertical gap | ≥ 8 m gap, otherwise surfaces collide |

Performance: these limits keep a level at 55–60 fps on the oldest supported iPad (iPad Pro
12.9-inch, 2nd generation, A10X). Wider and longer platforms mean more triangles to draw.

### 4.1 Up, down and flat
The slope is a design tool, not a direction the level has to follow. Each kind of slope
plays differently:

| Slope | How it plays | Use it for |
|---|---|---|
| **Downhill** | The ball speeds up by itself (about 1.1 m/s² at grade 0.1). | Rush, swoops, the celebration run to the finish. |
| **Flat** | The ball coasts and slowly stops; it moves only when pushed. The player is fully in control. | Calm plazas, rest areas, tricky bits that need care (narrow bridges, hole fields). |
| **Uphill** | The ball slows down, and rolls back if the player stops pushing. A modest push (about 40 % of full) climbs even the steepest allowed slope. | Natural brakes before a turn or a narrow part, "effort and reward" moments, lookouts. |

**Rules for climbs** (the hard limits in §4 are checked by `slopeProblems()` in the tests):

- **Safe to roll back into.** A ball that doesn't make it up rolls back down, so the bottom
  of every climb (the climb itself and the 10 m before it) must be wide (≥ 5 m) with no
  holes and no narrowing.
- **No climbing right after the start.** Otherwise a rolled-back ball could cross the start
  pad and leave through its open back edge. The tests forbid climbing in the first 12 m;
  aim for 15 m.
- **Plain ground over a crest.** Leave at least 8 m of easy platform after the top of a
  climb (§2.4); the player can't see over it.
- **Smooth changes.** Neighbouring segments differ in slope by at most 0.2 (0.12
  comfortable). Sharper crests can toss the ball into the air at speed.
- **Don't make it a grind.** Keep each climb under 20 m and total climbing under about a
  third of the route. Follow a climb with flat or downhill track.

**Height patterns that feel fresh**

- **Rolling hills:** down, up, down on a wide straight; the ball surges and floats (§5.4).
- **Valley:** down into a dip and up the other side. It's a natural brake and rest spot,
  with no braking needed from the player.
- **Lookout:** a gentle climb to a wide, flat plateau with something to see, then a swoop
  down.
- **Flatland:** a whole level at grade 0, winding and calm. Every bit of motion comes from
  the player.
- **Step-ups:** short climbs separated by flat terraces. It feels like climbing stairs,
  and each terrace is a rest area.

---

## 5. Building "freshness" with today's engine

You can make plenty of new-feeling levels with the existing format alone. Use these
patterns.

### 5.1 Two lanes (diverge and converge, faked)
A wide section (10–12 m) with a **chain of overlapping holes down the middle** splits the
route into two lanes that rejoin afterwards. Make the lanes different: one with a gentle
curve, one with a small notch, or give the chain a kink so the lanes swap widths.

Space the circles **at most 1.25 × r apart**. Then the slot between the lanes is
everywhere wider than the ball (1 m), so it is a real divider with no tile "bridges".
Wider spacing leaves narrow gaps the ball rolls straight across.
```ts
width: [[20, 6], [26, 11], [52, 11], [58, 6]],
// 14 circles, r 1.2, 1.5 m apart (= 1.25 × r): a clean 20 m divider, lanes ≈ 4.3 m wide.
holes: Array.from({ length: 14 }, (_, i) => ({ s: 28 + i * 1.5, u: 0, r: 1.2 })),
```

### 5.2 Island roundabout
One **big hole** (r 2–3 m) in the middle of a wide plaza (12–14 m). The player chooses to
go left or right around it, then the paths meet again: a fork and merge in one shape.
Put a second island later, offset to one side, so the "short way" flips sides.

### 5.3 Funnel and plaza
Wide plaza → gentle funnel → short chute → plaza again. It feels like a river flowing
through a gorge. Keep the chute ≥ 4.5 m wide and straight, with the plazas flat (grade ≤ 0.04).

### 5.4 Roller coaster
Alternate drops (0.12, 10 m) with short climbs (−0.06, 8 m). That's a slope change of
0.18, inside the 0.2 limit. The ball surges and floats. Keep it straight and wide (≥ 6 m) so the only sensation is the ride.

### 5.5 Slalom flags
Notches alternating left and right (holes cutting into the edges, r 0.9–1.1) on a 7 m
wide straight. The player sways through them. This is the hook of Slalom (level 7).

### 5.6 Shapes worth drawing (silhouette variety)
Seen from above, every level should have its own outline. Some ideas:

- question mark
- hairpin with a wide outside
- long arc
- double-S
- descending figure-8 (overpass with ≥ 9 m gap)
- "snail shell" spiral that tightens slowly (keep radius ≥ 10)
- zig-zag staircase of short straights with 90° turns of radius 14

### 5.7 Color and mood
The `theme` is cheap freshness. Use a different palette per level:

- `tileA` and `tileB` must clearly contrast so the motion reads.
- `rim` is bright; it's the edge warning.
- `horizon` is different from the tiles, so the platform stands out against the void.

Some ideas:

- **Sunset:** orange and pink tiles, purple sky.
- **Mint:** mint and white tiles, teal sky.
- **Night:** deep navy tiles with a cyan rim, near-black sky.
- **Candy:** pink and lemon tiles, blue sky.
- **Forest:** green tiles, golden horizon.

### 5.8 Coin spots (every level needs them)
Coins are a big part of the fun for kids, and they make every play of a level a little
different. **Coins only ever appear on spots you designate.** You place the *spots*; the
game decides the rest each time a level is played:

- Each spot holds a coin with an **80 %** chance, so the pattern changes every play.
- Each coin's color is rolled by rarity: **yellow 60 %**, **blue 25 %**, **purple 11 %**,
  **orange 4 %** (most common to most rare).
- Never try to choose colors or which spots fill; that is random by design.
- Collected coins go straight into the wallet and are kept even if the ball then falls.
- Coins have no use yet; the wallet just counts them.

**Hard rules.** The tests check these with `coinSpotProblems()`; a level fails if any is
broken:

| Rule | Value |
|---|---|
| Spots per level | 15–40 |
| Distance from the platform edge | ≥ 0.6 m (coin center) |
| Distance from any hole rim | ≥ 0.6 m |
| Distance between spots | ≥ 1.2 m |
| Where along the route | from authored s = 1 to 1 m before the finish line |

**Design rules (freshness, not difficulty)**

- **Coins show the way.** A trail along the good line teaches the route: the inside of
  curves, the safe gap between holes, the middle of a narrow bridge. Players follow coins
  instinctively, so a coin trail is a gentle hint.
- **Coins never lure toward danger.** Even though 0.6 m passes the test, keep ≥ 1.1 m from
  hole rims and ≥ 1.2 m from edges on narrow sections. Never put a coin where reaching it
  means risking a fall.
- **Rhythm:** groups of 3–7 spots with small gaps between groups, about one spot every
  2.5–4 m overall. One unbroken line all the way is boring.
- **Start early:** a short row in the first 10 m teaches "roll through coins to collect".
- **Shapes add freshness:**
  - straight rows on straights
  - diagonals that invite a gentle swerve
  - arcs on the inside of curves
  - a ring of spots around a roundabout island (§5.2), so both ways round pay
- **Choices pay both ways.** In two-lane sections (§5.1) and real forks (§7.1), give every
  lane or branch spots, in similar numbers.
- **Optional extras:** a wide, safe side area or detour may hold a few bonus spots.
  Optional means truly safe, just a little out of the way.
- **Drops (§7.2):** put a short trail on the landing zone to reward the jump. Never place
  coins in mid-air.
- **Checkpoints (§7.10):** a couple of coins just after a gate make a nice "welcome back".
- **Hole levels:** to find a safe weaving line between holes, compute the line that
  stays farthest from holes *and* edges. The Roundabout and Slalom coins follow such
  lines.

---

## 6. Workflow for creating a level

### 6.1 Fill in a level card first (in your reply or plan, before writing code)
```
Name / tagline:
Hook (one new idea):
Main feeling (§2.2), and how it differs from the previous level:
Silhouette from above (one word or sketch):
Beat plan: Meet (m 0–?) · Play (?–?) · Twist (?–?) · Celebrate (?–end)
Height profile (where the route goes down, runs flat, climbs; §4.1):
Rest areas at:
Checkpoints at (only for levels over ~45 s, §7.10):
Coin spots (§5.8): how many, and the patterns (trail along the good line, arcs, rings…):
The one spicy moment (if any), and why it's fair:
Palette:
Engine features needed (today's format only? or §7 items?):
```

### 6.2 Implement
Append the `LevelDef` to `LEVELS` in `src/game/levels.ts`, using only today's format
unless the §7 feature you need already exists in the engine.

### 6.3 Check
1. `npm test`. It must pass. The suite already checks every level automatically:
   - a headless autopilot finishes the level without falling
   - holes stay inside the authored path
   - coin spots follow §5.8: 15–40 of them, clear of edges and holes, not overlapping
   - slopes follow §4: at most 0.2 either way, smooth changes, no climbing in the first 12 m
   - where the route passes over itself, the surfaces are at least 8 m apart
   - checkpoints follow §7.10, and the autopilot can finish the level from each of them
   - track pieces follow §3 (valid ids, starts and merges), drops follow §7.2, forks §7.1
   - surface tiles follow §7.3: inside the platform, clear of holes, not overlapping; music
     keys at least 1.2 m long; boost pads on straights with a clear, calm 15 m after them
   - the shape differs from all other levels
   - ids are sequential
2. `npm run dev`, then in the browser console run `game.startLevel(<id>)` and
   `game.autoplay = true` to watch the autopilot roll through it. Then play it yourself
   with the mouse acting as a finger.
3. **Fairness review.** The autopilot can drive perfectly, kids can't. Walk the level
   against §2.3, §2.4 and §4 and fix anything that breaks them, even if the tests pass.

### 6.4 Never renumber existing levels
Saved progress (unlocks, best times) is stored **by level id**. Add new levels at the end.
If a new level clearly belongs earlier in the difficulty order, ask the owner first;
reordering needs a progress migration.

---

## 7. Proposed mechanics that need engine work

These ideas need new code. They are written as **proposals**: design with them only when
the feature exists. Implementing one is a separate task, which should ask the owner and
come with tests. Each one says what it adds, the design rules, and a draft data format.

### 7.1 Real forks and merges: route graphs ✅ built
**Fresh because:** real choice. A scenic long way and a quick narrow way, or two
completely different mini-adventures that meet again.

Format: built on track pieces (§3). A branch is a piece that starts from the main route and
whose end rejoins it (`to`). The helpers in `src/game/forks.ts` build the usual shape, two
mirror-image "swings" that split and meet again:
```ts
segments: [straight(12, 0.05), straight(6, 0),            // flat approach: the fork area
           ...swing('right', 9, 14, 8, 0.06),              // the main route's way
           straight(8, 0), straight(16, 0.06)],            // flat after the merge, then home
pieces: [
  forkBranch('left', { at: 18, side: 'left', offset: 9, radius: 14, middle: 8, grade: 0.06 },
    { width: [[0, 8]], coins: [...], surfaces: [...] }),   // the other way; `to` is set for you
],
```
`swing(side, offset, radius, middle, grade)` bends out by `offset`, runs `middle` meters and
bends back onto the same line. Its first and last bends are flat: that is where the two
tracks overlap, and the physics engine only smooths seams inside one mesh, so overlapping
surfaces must be exactly level (otherwise the ball bumps). Give each side an `offset` of at
least the track width, so the two ways have separated before the slope starts.
Example: level 13, Two Paths.
Design rules:

- **Fork area:** at least 10 m wide and flat (grade ≤ 0.04), visible from 15 m away.
- **Branches differ in flavor, not danger.** If one branch is harder, it must also be
  clearly shorter, and the other must be easy. Lengths should be within ±30 % of each
  other.
- **Merges** happen on a wide junction pad (≥ 10 m wide, ≥ 8 m long) so balls arriving
  from either side never meet a seam or a gap.
- **No dead ends,** and no branch that leads back to an earlier point. Every branch moves
  toward the finish.

Built (checked by `forkProblems()`):

- The branch's end lines up with the track it rejoins (within 0.2 m, 2 cm and 3°).
- Where the two tracks overlap they are level within 5 mm (no seam to bump on); walls whose
  top edge runs across the other track are left out of the physics, and the overlapping edge
  glow is not drawn.
- The track is at least 6 m wide where the branch leaves and rejoins; no holes within 15 m
  of a junction.
- The branch is within 1.3× the length of the way it bypasses, and the two ways really
  separate (at least 2 m of open gap at the middle).
- No dead ends: every piece but the finish rejoins another or ends in a drop.
- The tracker follows the piece under the ball, the camera turns with it, and the progress
  bar counts route distance. The autopilot takes the branches in its `route` (the tests drive
  both ways, at speed, and check the ball never lifts off at a junction).

### 7.2 Drops: falling onto a new platform on purpose ✅ built
**Fresh because:** a moment of "whoa!" with no risk. The ball sails off a lip and lands on
a lower platform.

Format: a track piece (§3) that starts under the open end of another piece (its lip).
`dropTo()` in `src/game/drops.ts` builds it:
```ts
pieces: [
  dropTo('step1', { from: 'main', lip: 20, height: 1.5 },   // lip = authored length of 'main'
    { segments: [...], width: [[0, 12], ...] }),            // overlap (default 1.5 m) under the lip
],
```
The upper piece ends there (no run-out), so give the finish to the last piece (`finish: true`).
Example: level 12, Waterfall Steps (drops of 1.5, 2.5 and 3.5 m).
Physics for the rules: flight time is t = √(2·drop / 16). At a typical top speed of
14 m/s the ball travels 14·t meters forward.

| Drop | Flight time | Forward travel at 14 m/s | Minimum landing zone length |
|---|---|---|---|
| 1.5 m | 0.43 s | 6.1 m | 10 m |
| 2.5 m | 0.56 s | 7.8 m | 12 m |
| 4.0 m | 0.71 s | 9.9 m | 14 m |

Design rules:

- **Overlap:** the landing platform starts under the lip (gap ≤ 0). Then *every* speed
  lands; nobody fails a drop.
- **Landing zone:** at least 1.5× the launch width, flat or gently sloped, hole-free, and
  as long as the table above says.
- **Height:** 1.5–4 m. Over 5 m the chase camera loses the ball, and more feels scary
  rather than fun.
- **Telegraph it:** use a rim of a different color, chevrons on the tiles, or a short
  flat "launch pad" before the lip.
- **Waterfall:** a "waterfall staircase" of 3–5 small drops makes a great hook level.

Built (checked by `dropProblems()`; the tests also roll a slow ball down every drop):

- Height 1.5–4 m, measured from where the landing hangs off the lip.
- The landing starts at least 0.5 m under the lip, turns at most 10°, and keeps the lip's
  footprint inside it (it is at least 1.5× the lip's width).
- The landing zone (table above, counted from the lip) is straight, 0 to 0.06 downhill and
  hole-free.
- The last 6 m before the lip are a launch pad: straight, never climbing, no holes.
- Look and feel: a glowing amber strip across the lip; landing plays a soft thump and a
  light tap. The fall rule is "below every platform within reach", and the tracker moves to
  the landing while the ball is still in the air. The chase camera follows the ball down
  smoothly as it is.

### 7.3 Surface tiles (special materials) ✅ boost and music built
Painted strips or patches with their own behavior, each with a distinct look:

- **Boost arrows** ✅: a forward push. Use them on straights and before uphills.
- **Ice:** low friction; it glides. Only on wide, flat areas: fun, not scary.
- **Mud or sand:** slows the ball. A relief zone before something busy.
- **Glass:** fully safe, but you can see the void below. A thrill with zero risk.
- **Music tiles** ✅: each tile plays a note when the ball rolls over it. A "musical
  bridge" can play a little tune if the player follows the right line, a wonderful
  hook for kids.
- **Paint trail:** tiles change color where the ball rolled. Pure delight.

Format: `surfaces: [{ type: 'boost' | 'music', s0, s1, u0?, u1?, note? }]`, in authored path
coordinates like holes. Leave out `u0`/`u1` to cover the full width. The code is in
`src/game/surfaces.ts` (rules and effects) and `src/game/surfaceView.ts` (looks); new
types (ice, mud, glass, paint) slot into the same format.

**Boost arrows (built)**
- Look: orange pads with yellow chevrons that scroll forward; they flare when the ball
  rolls on. Sound: a rising whoosh, plus a light tap on the iPad.
- Effect: a forward push of 22 m/s² along the route while the ball rolls on the pad. It goes
  through the same speed cap as the player's push, so the ball never exceeds ~17 m/s.
- Rules (`surfaceProblems()`): only on straights; for 15 m after the pad no holes, at least
  5 m wide, and no curve tighter than 20 m radius. Speed must never meet a hazard.
- Use: on a flat after a calm start (meet), right before a hill so the ball flies up it,
  in one lane of two (a choice: speed or coins), and as a zoom into the finish.
- Example: level 11, Zoom Zoom.

**Music tiles (built)**
- Look: xylophone keys colored by note (C red, D orange, E yellow, F green, G blue, A
  violet, B pink; lighter for higher octaves), with small gaps between keys. A key flashes
  when the ball rolls onto it. Sound: a wooden mallet note (marimba-like).
- Notes: `note('C5')` = 0, in semitones; the range is C4 to C7. Each key plays once when
  the ball rolls onto it, again only after it left it.
- Rules: keys at least 1.2 m long (shorter ones blur together); the note in range.
- Design: 2 m keys play at a nice tempo at kid speeds (about 3 notes a second at 6 m/s).
  Put the tune on the coin line and something that fits around it in the side lanes (the
  same tune an octave lower works), so every line sounds good and the "right" one plays
  the song. Keys across the full width on a curve or a gentle slope make a rising scale.
- Example: level 10, Musical Bridge ("Twinkle Twinkle Little Star" on the middle lane).

### 7.4 Banked turns (bobsled)
The platform tilts into the curve, so the ball can take it fast and swoop.

- Draft: `bank: [[s, degrees], ...]`, positive tilts toward the inside of the turn.
- 5–15°.
- It feels great at speed; use it in "rush" levels.

### 7.5 Waves and rollers
Smooth bumps along the path, like a gentle sea.

- Draft: `waves: [{ s0, s1, amplitude, wavelength }]`.
- Amplitude 0.2–0.6 m, wavelength 6–12 m.
- Keep the ball on the ground: the crest's curvature must stay below g/v² at play speed.

### 7.6 Interactive props
- **Bowling pins** at the finish plaza: knock them over for a cheer. A perfect
  "celebrate" beat.
- **Domino rows** along the edge that topple as the ball brushes them.
- **Big soft balls** that roll away when nudged.
- **Bells or gongs** to ring on the way past.

Props are physics bodies placed by `{ s, u, kind }`. They must never block the only route
and must never push the ball off an edge. Keep them on wide areas, or behind a gap the
ball can't reach.

### 7.7 Moving platforms (gentle)
- **Turntable:** a slowly rotating round plaza (≤ 10°/s).
- **Ferry:** a platform section that slides sideways between two fixed pieces. The ball
  rides it across.
- **Elevator:** carries the ball down to the next piece; works with §7.2.

Rules: slow, predictable, and always with a safe place to wait. The player should never
fail by mistiming.

### 7.8 Collectibles (stars, gems)
Optional pickups along interesting lines. Taking the wide safe route still finishes the
level; following the stars is a bonus. Show "★ 2/3" on the win screen. This adds a reason
to replay without making anything harder.

### 7.9 Scenery and landmarks
Big set pieces that make a level memorable without touching the gameplay:

- a lighthouse at the finish
- floating islands with trees
- a rainbow arch the route passes under
- clouds the ball rolls through
- hot-air balloons
- a giant moon in night levels

These are cheap ways to make levels distinct. Keep them off the platform and out of the
camera's way.

### 7.10 Checkpoints ✅ built
Everything below is implemented: the `checkpoints` field (§3), the rules in
`checkpointProblems()` (`src/game/level.ts`), the gates in `src/game/view.ts`, respawning in
`src/game/game.ts`, and the tests in `tests/levels.test.ts`. Grand Tour (level 9) uses three.

A glowing gate across the platform. When the ball rolls through it, the gate lights up and
a soft chime plays. From then on, a fall respawns the ball **at that gate** instead of at
the entrance. Checkpoints let "adventure" levels be longer without making falls
frustrating.

**When to use them**
- Only in levels longer than about 45 seconds of play (§2.5). Short levels stay
  checkpoint-free; the entrance is close anyway.
- One every 35–50 m of path (20–30 s of play). At most 3 per level, at least 25 m apart.

**Where to put them**
- **On a rest area:** straight, at least 6 m wide, grade ≤ 0.06, and hole-free for 6 m on
  either side. A respawned ball must start somewhere calm, never facing a hazard.
- **At least 8 m of easy platform after the gate,** so the player gets their bearings
  before the next challenge.
- **Between beats:** after a hook's "play" part and before its "twist", after a drop's
  landing zone, or after a fork's merge plaza.
- **Never on a branch** of a fork (§7.1): put it before the fork or after the merge, so
  every player meets it.
- **Never right before the finish.** Give the last checkpoint at least 20 m to the
  finish line, so it's worth having.

**How it behaves**
- **Activation:** a checkpoint activates when the ball passes its line while on the
  platform. Checkpoints activate in order; passing a later one makes it the respawn point.
- **Respawn:** at rest on the gate's line, at the center of the platform, with the camera
  snapped behind the ball. The "Game Over" banner still shows, then the ball appears at the
  gate.
- **Timer:** respawning at a checkpoint doesn't reset it; it keeps running from the
  level start, so best times stay comparable. A fall before the first checkpoint still
  restarts the run from the entrance with a fresh timer, as today. Falls are still counted
  and shown on the win screen.
- **Restart Level** (pause menu) and **Replay** always go back to the entrance and clear all
  checkpoints.
- **Progress bar:** shows small ticks for checkpoints; reached ones light up.
- **Feedback:** the gate (two posts, a bar and a line across the track, in the level's rim
  color) is dim until the ball rolls through it, then flashes and stays lit. A soft
  two-note chime plays, the iPad gives a light tap, and "Checkpoint!" pops up under the
  progress bar. After a fall past a gate, the banner says "Back to the checkpoint…".

**Data format**
```ts
checkpoints: [42, 88],   // authored s of each gate, in order
// with route graphs (§7.1), later: checkpoints: [{ piece: 'main', s: 42 }]
```

**Rules the tests check** (`checkpointProblems()`)
- at most 3 gates; each at least 25 m after the start or the previous gate
- at least 20 m from the last gate to the finish line
- from 6 m before to 6 m after the gate: straight, grade 0 to 0.06 (never uphill: a
  respawned ball would roll back through the gate)
- from 6 m before to 8 m after the gate: at least 6 m wide, and no holes
- the autopilot can finish the level when started at rest at each gate

### 7.11 Level intro fly-over
For about 3 seconds before the start, the camera glides over the whole route, then settles
behind the ball. It shows the player the shape (forks, drops) before they roll. It adds
wonder and makes "choice" levels understandable.

---

## 8. Level concept bank

Mix and match. Items marked **today** fit the current format; others name the §7 feature
they need. The existing levels are listed at the end so you don't repeat them.

| # | Name | Hook | Feeling | Needs |
|---|---|---|---|---|
| A | Lazy River | Long sweeping S-curves on a wide teal platform, gentle grade | Calm, flow | today |
| B | Two Lanes | Hole-chain divider; lanes swap widths halfway | Choice | today (§5.1) |
| C | Roundabout | Two big islands, the short way flips sides | Choice | today (§5.2) |
| D | Roller Coaster | Steep dips and short uphills on a wide straight | Rush | today (§5.4) |
| E | Gorge | Plaza → funnel → chute → plaza, twice | Flow, surprise | today (§5.3) |
| F | Question Mark | Route shaped like "?", with the finish on the dot | Surprise | today |
| G | Overpass | Descending figure-8 passing under itself (≥ 9 m gap) | Wonder | today |
| H | Waterfall Steps | Four gentle drops onto overlapping lower platforms | Surprise | §7.2 |
| I | Choose Your Path | Fork: scenic wide loop vs short narrow bridge; merge plaza | Choice | §7.1 |
| J | Musical Bridge | Music tiles play a tune on the right line | Play | §7.3 |
| K | Ice Rink | Huge flat icy plaza to glide across, then an easy chute | Play | §7.3 |
| L | Bobsled | Banked sweeping turns at speed | Rush | §7.4 |
| M | Sea Swell | Rolling waves on a wide straight under a sunset | Calm | §7.5 |
| N | Strike! | Ordinary route with a bowling-pin finish | Celebrate | §7.6 |
| O | Ferry Crossing | Ride a sliding platform over the void | Wonder | §7.7 |
| P | Star Trail | Stars mark a curvy optional line | Play | §7.8 |
| Q | Night Lights | Dark theme, glowing rims, a rainbow arch | Calm, wonder | today (theme) / §7.9 |
| R | Paint Party | Tiles change color where you roll | Play | §7.3 |
| S | Grand Tour | An ~80 s adventure chaining a roundabout, a roller coaster and a gorge, with 2 checkpoints | Wonder | §7.10 (+ today's patterns) |
| T | Treasure Trails | Three wide plazas, each with a roundabout island ringed by coin spots | Play | today (§5.2 + §5.8) |
| U | Lookout | Climb gently to a wide flat plateau with a view, then swoop down to the finish | Effort and reward | today (§4.1) |
| V | Flatland | A completely flat, winding route; the ball only moves when pushed | Calm | today (§4.1) |
| W | Valley Run | Three dips, each a natural brake before a gentle bend | Flow | today (§4.1) |

A possible **world structure**: group 4–6 levels into a themed world. Each world introduces
one new mechanic and ends with a showcase level that combines it with earlier ones (still
gently). The showcase is a good place for the world's one checkpointed adventure level.

1. World 1, Basics: the current levels 1–8.
2. World 2, Choices: lanes, roundabouts, real forks.
3. World 3, Up & Down: roller coaster, drops, waterfall.
4. World 4, Surfaces: ice, boost, music.
5. World 5, Adventures: ferries, props, longer checkpointed tours.

**Existing levels (don't duplicate the hook).** World 1 teaches one basic each, from
concepts A, D, E, C, U and G above plus a tutorial and a slalom, and ends with S (Grand
Tour), its checkpointed showcase. Levels 10 and 11 start the surface tiles (J and a boost
level), 12 the drops (H) and 13 the forks (I). Concepts still free: B, F, K–R, T, V, W.

| # | Name | Hook | Feeling |
|---|---|---|---|
| 1 | First Roll | Tutorial: a long, wide slope with one slight bend; coins teach steering | Calm |
| 2 | Lazy River | Big, lazy S-bends; widens into a "lake" on the last bend | Flow |
| 3 | Roller Coaster | Drops and short climbs, a camel hump, then a sweeping bend home | Rush |
| 4 | Canyon | Plaza → funnel → chute → plaza, twice (chutes 5.5 m and 4.5 m) | Surprise |
| 5 | Roundabout | Big island holes in wide plazas; the wide way flips sides | Choice |
| 6 | Lookout | Three step-ups with flat terraces to a wide lookout, then a swoop down | Effort and reward |
| 7 | Slalom | Notches on alternate edges, then two "ski gates" | Precision (light) |
| 8 | Overpass | A 270° loop that rolls under the bridge you started on (9 m+ below) | Wonder |
| 9 | Grand Tour | Adventure (~180 m) with 3 checkpoints: island, hills, lookout, slalom bend, sweep home | Wonder |
| 10 | Musical Bridge | Music tiles: a rising scale, a three-lane song bridge, a curve that climbs the scale | Play |
| 11 | Zoom Zoom | Boost arrows: on the flat, before a hill, in one lane of two, into the finish | Rush |
| 12 | Waterfall Steps | Drops of 1.5, 2.5 and 3.5 m onto wider steps below, each step bending a little | Surprise |
| 13 | Two Paths | A fork: the right way is a coin trail, the left way plays music keys; they meet again | Choice |

---

## 9. Don'ts (quick checklist)

- ❌ A level that is just an earlier one made narrower or steeper.
- ❌ Hazards in the first 8 m or the last 15 m.
- ❌ Stacked hazards: narrow + tight curve + holes + steep together.
- ❌ Danger hidden behind a crest, a drop or a tight turn exit.
- ❌ Narrow sections longer than 15 m, or narrower than 3.5 m.
- ❌ Forks where one branch is a trap; dead ends.
- ❌ Drops without an overlapping, wide landing zone.
- ❌ Slopes steeper than 0.2 either way, sudden slope changes, or a climb in the first 12 m.
- ❌ A climb whose bottom is dangerous to roll back into (holes, narrowing, an edge).
- ❌ Long uphill grinds; follow every climb with flat or downhill track.
- ❌ Levels longer than about 45 s without checkpoints, or over ~90 s even with them.
- ❌ Checkpoints facing a hazard, on a fork branch, or within 20 m of the finish.
- ❌ Renumbering or reordering existing level ids.
- ❌ Levels without coin spots, or coins that tempt a risky line (near edges, beside holes,
  in mid-air).
- ❌ Walls, fences or rails. The game is "no fences" by design (§10).

---

## 10. Open questions for the owner

Ask before using these:

1. ~~**Checkpoints**~~: **decided 2026-11-24: allowed.** Longer levels may respawn the
   ball at the last checkpoint reached. Rules are in §7.10.
2. **Collectibles and stars** (§7.8): add a replay goal and a star count on the win screen?
3. **"No fences" exceptions:** is a short curved half-pipe or gutter section ever OK, or
   are edges always open?
4. **Target player:** age and typical session length, to fine-tune widths and level
   length.
5. **What coins are for:** coins are collected into a wallet but have no use yet. A shop for
   ball skins or platform themes would fit; decide before designing coin-heavy levels.

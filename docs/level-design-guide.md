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

A steel ball rolls down a floating, fence-less platform. The camera follows behind it and
the ball stays in the center of the screen. While a finger is on the screen, the ball is
pushed toward the finger, harder the farther the finger is from the center. Falling off an
edge or into a hole is **Game Over**, and the ball respawns at the entrance of the level, or
at the last checkpoint reached once checkpoints exist (§7.10, approved, not built yet).
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
- **Flow**: rhythmic S-curves; the player finds a swing.
- **Calm**: wide, gentle and scenic. A breather after something busy.
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
A fall sends the ball back to the entrance, or to the last checkpoint once checkpoints exist.
So a long stretch without a checkpoint makes a fall expensive.

- **Standard levels:** **25–45 seconds** of play for a typical child (about 50–110 m of
  authored path at the current speeds). No checkpoint needed.
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
  grade: 0.09,                    // default drop per horizontal meter (downhill)
  segments: [                     // the centerline, built like a turtle
    straight(12),                 // length in m, optional own grade: straight(10, 0.15)
    left(60, 16),                 // angle in degrees, radius in m, optional grade
    right(120, 14),
    straight(20, 0.04),
  ],
  width: [[0, 8], [30, 6], [60, 9]],   // [s, width] keyframes, smoothstep between them
  holes: [{ s: 40, u: -1.5, r: 1.2 }], // s along the path, u sideways (+ = right), radius
  coins: [                             // REQUIRED: designated coin spots (see §5.8)
    ...coinRow(4, 5, 2),               // 5 spots down the middle, 2 m apart
    ...coinLine(20, -2, 30, 2, 5),     // a diagonal line from (s 20, u -2) to (s 30, u 2)
    ...coinSpots([[44, 1.5], [47, 0.5], [50, -0.5]]),   // explicit [s, u] spots
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
- Grade changes are smoothed over 5 m, so slopes blend gently. A **negative grade means
  uphill**: the ball slows and the player must push. Use it short and gently.
- Width changes are smooth too, so a keyframe pair is a gentle funnel, not a step.
- Holes are circles. They can cut into an edge (a notch) or overlap each other. A chain of
  overlapping holes makes a slot with scalloped edges.
- Coin spots use the same `s`/`u` coordinates as holes. The helpers `coinRow`, `coinLine` and
  `coinSpots` come from `src/game/coins.ts`.
- Exactly **one continuous ribbon** per level: no forks, no gaps, no separate platforms.
  §5 shows how to fake forks today; §7 proposes the real thing.
- The route may pass **over itself** only with a big vertical gap (as in the Spiral level):
  at least 8 m between the two surfaces at the crossing.

---

## 4. Numbers and limits

Numbers come from the current physics: gravity 16 m/s², ball diameter 1 m, top push
speed about 11–17 m/s, typical play speed 5–10 m/s. The **hard limit** column is enforced
by the engine or tests, or is the point where the game breaks.

| Knob | Comfortable (most of a level) | Spicy (one short moment) | Hard limit |
|---|---|---|---|
| Width | 5–10 m | 3.5–4.5 m for ≤ 15 m | ≥ 3.0 m; max width ≤ 14 m (mesh size) |
| Grade (downhill) | 0.06–0.12 | 0.13–0.18 for ≤ 20 m | ≤ 0.2 |
| Uphill | −0.03 to −0.06 for ≤ 10 m | −0.08 for ≤ 6 m | the ball must still make it over at a gentle push |
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
Alternate steep drops (0.15, 10 m) with short uphills (−0.05, 6 m). The ball surges and
floats. Keep it straight and wide (≥ 6 m) so the only sensation is the ride.

### 5.5 Slalom flags
Notches alternating left and right (holes cutting into the edges, r 0.9–1.1) on a 7 m
wide straight. The player sways through them. This is the gentle cousin of "Tightrope".

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
  stays farthest from holes *and* edges. That is how the Swiss Cheese, Hole Alley and
  Tightrope coins were placed.

---

## 6. Workflow for creating a level

### 6.1 Fill in a level card first (in your reply or plan, before writing code)
```
Name / tagline:
Hook (one new idea):
Main feeling (§2.2), and how it differs from the previous level:
Silhouette from above (one word or sketch):
Beat plan: Meet (m 0–?) · Play (?–?) · Twist (?–?) · Celebrate (?–end)
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

### 7.1 Real forks and merges: route graphs
**Fresh because:** real choice. A scenic long way and a quick narrow way, or two
completely different mini-adventures that meet again.

Draft format: a level becomes a set of **pieces** (each piece is today's ribbon) plus links.
```ts
pieces: [
  { id: 'main', segments: [...], width: [...] },
  { id: 'scenic', branchFrom: { piece: 'main', s: 30, side: 'left' },
    mergeInto: { piece: 'main', s: 75 }, segments: [...], width: [...] },
],
```
Design rules:

- **Fork area:** at least 10 m wide and flat (grade ≤ 0.04), visible from 15 m away.
- **Branches differ in flavor, not danger.** If one branch is harder, it must also be
  clearly shorter, and the other must be easy. Lengths should be within ±30 % of each
  other.
- **Merges** happen on a wide junction pad (≥ 10 m wide, ≥ 8 m long) so balls arriving
  from either side never meet a seam or a gap.
- **No dead ends,** and no branch that leads back to an earlier point. Every branch moves
  toward the finish.

Engine notes:

- Build a platform for each piece, and add junction pads where pieces meet.
- The tracker follows the piece under the ball.
- The camera's heading comes from the current piece.
- The progress bar uses the main route.
- The autopilot needs a route choice so the tests can cover both branches.

### 7.2 Drops: falling onto a new platform on purpose
**Fresh because:** a moment of "whoa!" with no risk. The ball sails off a lip and lands on
a lower platform.

Draft format: a piece that starts *below and ahead* of the previous piece's end.
```ts
{ id: 'lower', after: { piece: 'upper', drop: 2.5, gap: -1 }, segments: [...], width: [...] }
// gap < 0: the landing platform starts 1 m *under* the lip (overlap), so even a slow ball lands.
```
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

Engine notes:

- Change the fall rule from "2.2 m below *the* path" to "below every platform within reach".
- The tracker switches pieces when the ball lands.
- The camera eases its height during the fall.

### 7.3 Surface tiles (special materials)
Painted strips or patches with their own behavior, each with a distinct look:

- **Boost arrows:** a forward push. Use them on straights and before uphills.
- **Ice:** low friction; it glides. Only on wide, flat areas: fun, not scary.
- **Mud or sand:** slows the ball. A relief zone before something busy.
- **Glass:** fully safe, but you can see the void below. A thrill with zero risk.
- **Music tiles:** each tile plays a note when the ball rolls over it. A "musical
  bridge" can play a little tune if the player follows the right line, a wonderful
  hook for kids.
- **Paint trail:** tiles change color where the ball rolled. Pure delight.

Draft: `surfaces: [{ s0, s1, u0?, u1?, type: 'boost' | 'ice' | 'mud' | 'glass' | 'music' | 'paint', note? }]`

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

### 7.10 Checkpoints ✅ approved by the owner (not built yet)
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

**Draft data format**
```ts
checkpoints: [42, 88],   // authored s of each gate, in order
// with route graphs (§7.1): checkpoints: [{ piece: 'main', s: 42 }]
```

**Engine and test notes**
- The game respawns at the latest activated checkpoint's position (today it uses the
  fixed spawn point). The tracker resets to that s.
- A gate mesh, like the finish gate but in the level's rim color, with a lit/unlit state.
- New tests:
  - every checkpoint sits on a valid rest area (width, grade, hole-free span)
  - the autopilot can finish the level when spawned at each checkpoint
  - spacing and count follow the limits above

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

A possible **world structure**: group 4–6 levels into a themed world. Each world introduces
one new mechanic and ends with a showcase level that combines it with earlier ones (still
gently). The showcase is a good place for the world's one checkpointed adventure level.

1. World 1, Basics: the current levels 1–8.
2. World 2, Choices: lanes, roundabouts, real forks.
3. World 3, Up & Down: roller coaster, drops, waterfall.
4. World 4, Surfaces: ice, boost, music.
5. World 5, Adventures: ferries, props, longer checkpointed tours.

**Existing levels (don't duplicate the hook):**

| # | Name | Hook |
|---|---|---|
| 1 | First Roll | Wide straight |
| 2 | Narrowing | Width funnel |
| 3 | The Bend | Left/right curves |
| 4 | Swiss Cheese | Scattered holes |
| 5 | Serpentine | Tight S-curves |
| 6 | Spiral Descent | 450° spiral |
| 7 | Hole Alley | Curves plus holes |
| 8 | Tightrope | Narrow zig-zag with notches |

---

## 9. Don'ts (quick checklist)

- ❌ A level that is just an earlier one made narrower or steeper.
- ❌ Hazards in the first 8 m or the last 15 m.
- ❌ Stacked hazards: narrow + tight curve + holes + steep together.
- ❌ Danger hidden behind a crest, a drop or a tight turn exit.
- ❌ Narrow sections longer than 15 m, or narrower than 3.5 m.
- ❌ Forks where one branch is a trap; dead ends.
- ❌ Drops without an overlapping, wide landing zone.
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

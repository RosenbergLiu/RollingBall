# Rolling Ball

An iPad game: steer a steel ball along floating, fence-less tracks that run downhill, flat
or gently uphill. Built with
[Three.js](https://threejs.org) (rendering), [Rapier](https://rapier.rs) (physics) and
[Capacitor](https://capacitorjs.com) (native iOS wrapper).

## How to play

- The ball always sits in the middle of the screen.
- Pick a control mode in **Settings** (main menu, or the pause menu during a level). The
  choice is saved on the device.
  - **Touch** (default): touch and drag anywhere; while your finger is down the ball is
    pushed toward your finger. The farther your finger is from the ball, the stronger the
    push. Lift your finger to stop pushing.
  - **Joystick**: a virtual stick at the bottom center of the screen. Push it the way you
    want to roll; the farther you push, the stronger the push. Let go and it springs back.
- Falling off an edge or into a hole is **Game Over**; the ball respawns at the entrance.
- Some levels have **special tiles**: orange **boost arrows** push the ball forward with a
  whoosh, and colored **music tiles** each play a note when the ball rolls onto them (follow
  the coins over the Musical Bridge to hear a song).
- Some tracks **fork**: pick the left or the right way; both meet again further on.
- Some tracks end at a glowing **lip**: roll off it and land on a wider platform below.
  Every speed lands safely.
- Long levels have **checkpoints**: glowing gates across the track. Roll through one and it
  lights up; after a fall the ball comes back at the last gate passed instead of the
  entrance, and the timer keeps running. Restart Level and Replay start from the entrance.
- Collect **coins** by rolling through them: yellow, blue, purple and orange, from most
  common to most rare. Coins only appear on spots designed into each level, and every
  play rolls a different set. They go straight into your wallet (shown on the main menu)
  and are kept even if you fall. Coins have no use yet. A coin bursts into sparks with a
  chime when you grab it; grab several quickly and the chimes climb higher. Rarer coins
  sound (and burst) fancier, and orange is a jackpot.
- **Sound:** the ball rumbles and clicks over the tiles faster as it speeds up. Sound
  effects can be switched off in **Settings**. They follow the iPad's mute setting and mix
  with other audio (for example music playing in another app).
- Cross the checkered finish line to win, then go to the next level or back to the menu.
- Levels unlock in order. Locked levels can't be selected from the level menu.
  Progress and best times are saved on the device.

## Levels

| # | Name | What's new |
|---|------|------------|
| 1 | First Roll | Tutorial: long, wide slope with a slight bend |
| 2 | Lazy River | Big, lazy S-bends |
| 3 | Roller Coaster | Hills: drops and short climbs |
| 4 | Canyon | Plazas joined by narrow chutes |
| 5 | Roundabout | Island holes: go left or right |
| 6 | Lookout | Step-ups to a lookout, then a swoop down |
| 7 | Slalom | Notches on alternate edges, then ski gates |
| 8 | Overpass | Loop around and roll under the start bridge |
| 9 | Grand Tour | A long adventure with 3 checkpoints |
| 10 | Musical Bridge | Music tiles that play a song |
| 11 | Zoom Zoom | Boost arrows |
| 12 | Waterfall Steps | Drops onto lower steps |
| 13 | Two Paths | A fork: pick a way, they meet again |
| 14 | Twisted Braid | Two ways cross over and under each other |
| 15 | Spaghetti Junction | Loops, bridges and a double waterfall |

Levels live in [src/game/levels.ts](src/game/levels.ts). Each is a list of straight/arc segments
with a grade (drop per meter: positive is downhill, 0 is flat, negative climbs), width
keyframes, holes and coin spots, so adding one is a few lines.

**Designing new levels** (by hand or with an AI): follow
[docs/level-design-guide.md](docs/level-design-guide.md). It covers the design philosophy
(freshness over difficulty), the engine's limits, patterns that work today, proposed new
mechanics, a bank of level ideas, and the checks every level must pass.

## Development

```bash
npm install
npm run dev        # play in a browser at http://localhost:5173 (mouse works like a finger)
npm test           # unit tests + a headless autopilot that must finish every level
```

## iPad app

Requires Xcode. The iOS project is in `ios/` (Swift Package Manager, no CocoaPods).

```bash
npm run ios        # type-check, build the web bundle and copy it into the iOS project
npm run ios:open   # open in Xcode, then pick an iPad (or simulator) and press Run
```

The app is iPad-only, full screen, works in every orientation and hides the status bar.
To run on a real iPad, set your signing team in Xcode (App target → Signing & Capabilities).

### Supported iPads

- **Minimum: iPadOS 15.0.** That covers the iPad Pro (2nd generation, 2017: 12.9-inch and
  10.5-inch, A10X), which runs iPadOS 15, 16 and 17, and every newer iPad.
- **Target device:** iPad Pro 12.9-inch (2nd generation), model **MQDD2X/A** (identifier
  `iPad7,1`, A10X, 4 GB, 2732×2048) on **iPadOS 17.7.11**, its final iPadOS version.
  The device build is checked: the app and the Capacitor frameworks are `arm64` with a
  minimum OS of 15.0.
- iPadOS 15 is also the floor for the tech: Xcode 27 and Capacitor 8 can't target anything
  older, and three.js needs WebGL 2, which iPad Safari/WebKit first enabled in iPadOS 15.
- The web bundle is compiled for Safari 15 (`vite.config.ts`). three.js ships syntax that
  needs Safari 16.4, and that syntax would otherwise stop the game from starting on
  iPadOS 15.0–16.3. Rapier's physics WASM only uses WebAssembly features Safari 15 has
  (checked: no SIMD, tail calls or exceptions).
- **Older, slower GPUs:** the game measures its frame rate and, below ~48 fps, steps
  down the render resolution and shadow detail (`src/game/quality.ts`). It steps back up
  once it runs at ~60 fps again, for example after Low Power Mode (which caps web content
  at 30 fps) is switched off. The chosen level is remembered on the device. Debug builds
  log `[perf] … fps · quality …` every 10 seconds.

### Running on your own iPad

One-time setup:

1. Xcode → Settings → Accounts: sign in with your Apple ID (a free account is enough for
   your own devices).
2. Connect the iPad by USB, unlock it and tap **Trust This Computer**.
3. On the iPad: Settings → Privacy & Security → **Developer Mode** → On (it restarts).

Then build, install and launch with the console attached:

```bash
TEAM_ID=<your team ID> npm run ios:device
```

The team ID is shown in Xcode → Settings → Accounts (select the team). With a free account,
the app has to be reinstalled every 7 days. The script signs the app as
`com.rollingball.game.t<team id>`, because `com.rollingball.game` is already taken at Apple.
Choose your permanent app ID before publishing to the App Store.

Tested on the target iPad (iPad Pro 12.9-inch 2nd gen, iPadOS 17.7.11), with the previous level set: levels 1–5 play
correctly. With Low Power Mode on, iPadOS caps the game at 30 fps and it keeps full
quality. With it off, the game settles at quality level 2–3 (1.25×–1× resolution, solid
panels instead of blur) at 55–60 fps. The quality step-down judges each 1.5-second window
by its typical (median) frame and only lowers quality after two slow windows in a row, so
one-off moments (a fall, the Game Over banner) don't change it.

## Game category, parental controls and Screen Time

Screen Time and parental controls are system features. They apply to every App Store app
without any code, so the job is to make sure the app is categorized and rated correctly
and behaves well when iOS limits it:

- **Category:** `Info.plist` declares `LSApplicationCategoryType = public.app-category.games`
  and `GCSupportsGameMode = true` (Game Mode on iPadOS 18+).
- **Screen Time** reports usage per app and per category, so the game shows up under
  **Games**. A parent can set an **App Limit** for Games (or just this app), add it to
  **Downtime**, or block it entirely.
- **Interruptions:** when a time limit, Downtime or the home gesture takes the app
  off-screen, the current run pauses (checked on the simulator). The physics and the
  timer stop, and the Pause menu is waiting on return. Unlocked levels and best times are
  saved the moment a level is completed.
- **Privacy:** the game is fully offline. It has no accounts, ads, analytics, in-app
  purchases, external links or web content. `ios/App/App/PrivacyInfo.xcprivacy` declares
  no tracking and no collected data. It also declares the on-device `UserDefaults`
  storage used for progress (reason `CA92.1`), which App Store uploads require.

### App Store Connect checklist (done by you, not by code)

The App Store category and age rating are what Screen Time and Content & Privacy
Restrictions actually use. Set them when you create the app record:

1. **Primary category: Games.** Pick a game subcategory, e.g. *Casual* or *Arcade*.
   This is the category Screen Time uses for App Store installs.
2. **Age rating:** answer "None" to every content question → **4+**. Parents who
   restrict apps by age can still allow it, and it is allowed at every restriction level.
3. **App Privacy:** "Data Not Collected".
4. **Kids Category (optional):** the app meets Apple's rules (no ads, tracking, purchases or
   external links). Choose it only if you're targeting children under 11. It can't be
   removed later without Apple's help.

Builds you install yourself from Xcode aren't App Store installs, so Screen Time may
list them under "Other" until the app comes from the App Store or TestFlight.

## Code map

- `src/game/path.ts` – turns segments into a smooth sampled centerline.
- `src/game/level.ts` – level types, track pieces (placement, route distance), widths, holes,
  spawn/fall/finish rules, checkpoint, piece and overlap rules.
- `src/game/platform.ts` – builds the platform mesh (top, walls, rim, round holes) and colliders.
- `src/game/physics.ts` – Rapier world, ball body, touch acceleration and speed cap.
- `src/game/tracker.ts` – follows the ball along the track (piece, progress, lateral offset,
  height); moves to another piece when the ball lands on it.
- `src/game/game.ts` – game loop, states, camera, input mapping.
- `src/game/forks.ts` – forks: the `swing()` and `forkBranch()` helpers and the fork rules.
- `src/game/drops.ts` – drops: the `dropTo()` helper, the drop rules and where the lips are.
- `src/game/surfaces.ts` – surface tiles (boost arrows, music tiles): format, rules, effects.
- `src/game/surfaceView.ts` – how surface tiles look: scrolling arrows, xylophone keys.
- `src/game/input.ts` – the control modes: touch and the on-screen joystick.
- `src/game/settings.ts` – player settings (control mode, sound on/off), saved with `src/game/storage.ts`.
- `src/game/sound.ts` – sound effects synthesized with the Web Audio API (no audio files): the
  rolling sound (speed-to-volume rules) and the coin chimes (rarity voices, pickup combo).
- `src/game/view.ts` – Three.js materials, sky, lights, finish gate.
- `src/ui/ui.ts`, `src/style.css` – menus, level select, HUD, dialogs.
- `src/game/coins.ts` – coin colors and rarity, coin spot helpers and rules, per-play spawn roll, pickup.
- `src/game/coinView.ts` – the spinning 3D coins.
- `src/game/coinBurst.ts` – the coin pickup burst: sparks and a flash in one pooled particle draw.
- `src/game/wallet.ts` – the coin wallet (saved on the device).
- `src/game/autopilot.ts` – drives the headless level tests (and `game.autoplay` for debugging).
- `tools/art.html` – renders the app icon and launch screen with the game's own 3D assets.

## Artwork

The app icon (a steel ball on a curving checkered slope) and the launch screen (the ball on
the game's dark background) are rendered from the game's own 3D assets:

1. `npm run dev`, then open http://localhost:5173/tools/art.html. It saves
   `resources/icon-1024.png` and `resources/splash-2732.png`.
2. `npm run art:install` copies them, without transparency as Apple requires, into the
   iOS asset catalog. It also writes the web favicon and home-screen icon into `public/`.

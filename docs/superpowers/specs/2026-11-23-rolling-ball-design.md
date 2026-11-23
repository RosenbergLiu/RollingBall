# Rolling Ball — iPad game design

## Intent
A metal ball rolls down sloped platforms without fences. The player keeps it on the
platform with touch input and reaches the finish line. Multiple levels with different
shapes, unlocked in order.

## Requirements (from the request)
- iPad (iOS) game built with Three.js; Rapier for physics.
- Each level: a sloped surface, no edge fence, its own shape (curved paths, holes).
- Falling off (edge or hole) = game over, then the ball respawns at the entrance.
- Ball always at the screen center. While a finger is down, the ball is accelerated in
  the direction from screen center to finger; larger distance = more acceleration.
  Released finger = no acceleration.
- Reaching the end line wins; win screen offers Next Level or Menu.
- Menu with level select; locked levels cannot be selected.

## Approach
- **Chosen:** Vite + TypeScript + three + @dimforge/rapier3d-compat (WASM inlined, works
  in WKWebView), wrapped as a native iPad app with Capacitor 8 (Swift Package Manager —
  CocoaPods is not installed). The same build runs in a browser for quick testing.
- Rejected: PWA-only (not an installable iOS app); native SceneKit/RealityKit (request
  asked for Three.js).

## Design
- **Levels** are authored with a turtle path (straight / arc segments with grade), turned
  into a smooth centerline. Width keyframes along the path; circular holes at
  (fraction along path, lateral offset, radius).
- **Platform mesh** is a grid in (arc length, lateral) space; cells inside holes are
  removed and boundary vertices are snapped onto the hole circle. Side walls + bottom are
  generated for every open edge. The same triangles feed a Rapier trimesh collider
  (FIX_INTERNAL_EDGES) on a fixed body.
- **Ball:** dynamic Rapier ball (r = 0.5) with CCD, friction, light damping; metal
  PBR material with an environment map, faint bands so rolling is visible. Fixed 60 Hz
  physics with render interpolation (ProMotion).
- **Path tracker:** windowed nearest-sample search gives progress, surface height and
  heading; windowed search keeps the ball from "landing" on a lower spiral loop.
- **Fall:** ball more than 2.5 below the tracked surface → GAME OVER banner (~1.6 s, camera
  freezes in place and watches the fall) → respawn at entrance.
- **Win:** progress past the finish line (checkered strip + gate) while on the surface.
- **Camera:** behind and above the ball along the smoothed path heading, always
  `lookAt(ball)` so the ball stays centered. Input is camera-relative.
- **Progress:** highest unlocked level + best times via @capacitor/preferences
  (localStorage on web).
- **UI:** DOM overlays — title/menu, level select grid (locked tiles disabled), HUD
  (level, timer, falls, progress, pause), game-over banner, win dialog, pause dialog.
- **Testing:** vitest unit tests for platform generation, tracker, progress/unlocks, and a
  headless physics simulation where an autopilot drives every level to confirm each one is
  completable.

## Builder calls
- 8 levels, easy → hard. Gravity and acceleration tuned for feel, not realism.
- Touch can begin anywhere; the vector is always measured from screen center.
- iPad-only device family; all orientations; status bar hidden.

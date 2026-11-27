# Free fall: land on any platform, Game Over only below the baseline

## Intent

Falling off the track should be a chance, not an instant loss. The ball may drop onto any
platform below it — a lower loop of the same ribbon, another piece, an earlier or a later part
of the route — and keep playing from there. Shortcuts and going backwards are both wanted.

## Rules

- **Landing:** whenever the ball leaves the spot the tracker follows (off an edge, through a
  hole, off a lip), the tracker looks for the nearest platform surface straight below the
  ball: any piece, any height, including lower loops of the same piece. While nothing is
  below, it keeps the last piece.
- **Game Over:** only when the ball's center drops below the **baseline**, 3 m under the
  level's lowest platform surface. The longest fall in the current levels is about 1.6 s.
- **Gates:** the finish and every checkpoint count only when the ball passes *forward through
  the gate's opening* (between the posts, under the bar / banner), rolling or in the air.
  Going over, around, or landing past a gate without going through it doesn't count.
  Crossing backwards does nothing. Checkpoints keep "furthest gate passed" semantics.
- **Camera:** keeps chasing the ball through the whole fall; it freezes (watching the ball
  drop away) only once the ball crosses the baseline.
- **Progress bar:** removed, with its checkpoint ticks. The "Checkpoint!" pop stays.
- **Wind:** while the ball is in the air, a looping airy noise layer (synthesized like the
  rolling rumble, no audio files) fades in, louder and brighter the faster the ball moves.
  It fades out on touchdown, and over ~0.5 s after Game Over. Short hops over crests stay
  near silent (it ramps in over the first fraction of a second in the air).
- **Landing sound:** touching down after a real fall (in the air ≥ 0.25 s) plays the existing
  thump and tap, wherever the ball lands.

## Approaches considered

1. **Path search for the surface under the ball (chosen).** The tracker already knows each
   piece's samples; a global "closest surface below" search reuses `closestUnder()`.
2. **Physics ray cast downward.** Exact, but all pieces are one merged collider, so a hit
   can't say which piece or where on the route it is — the path search would still be
   needed.
3. **Whitelist the designed overlaps.** Doesn't give "any platform".

## Left to the builder

Exact gate opening tolerances, wind filter/gain curves, and how the HUD closes the gap the
progress bar leaves.

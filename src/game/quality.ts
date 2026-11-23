export interface QualityLevel {
  /** Renderer pixel ratio (render resolution relative to CSS pixels). */
  pixelRatio: number;
  shadowMapSize: number;
}

/**
 * Quality steps from best to cheapest. Newer iPads stay on the first step; older ones
 * (e.g. the A10X in an iPad Pro 2nd generation with a 2732×2048 screen) step down.
 */
export function buildQualityLevels(devicePixelRatio: number): QualityLevel[] {
  const dpr = Math.max(1, devicePixelRatio || 1);
  const steps: QualityLevel[] = [
    { pixelRatio: Math.min(dpr, 2), shadowMapSize: 2048 },
    { pixelRatio: Math.min(dpr, 1.5), shadowMapSize: 2048 },
    { pixelRatio: Math.min(dpr, 1.25), shadowMapSize: 1024 },
    { pixelRatio: 1, shadowMapSize: 1024 },
    { pixelRatio: Math.min(dpr, 0.85), shadowMapSize: 512 },
  ];
  // Drop steps that would not change anything.
  return steps.filter(
    (s, i) => i === 0 || s.pixelRatio !== steps[i - 1].pixelRatio || s.shadowMapSize !== steps[i - 1].shadowMapSize,
  );
}

export interface GovernorOptions {
  /** Frames averaged per decision. */
  window: number;
  /** Average frame time above which quality steps down (seconds). */
  slowFrame: number;
  /** Frames ignored after a reset or a change (loading hitches, shader compiles). */
  warmup: number;
  /** Average frame time below which a better level is tried (seconds). */
  fastFrame: number;
  /** Consecutive fast windows needed before stepping up. */
  upWindows: number;
  /** Consecutive slow windows needed before stepping down (ignores one-off hitches). */
  downWindows: number;
}

const DEFAULTS: GovernorOptions = {
  window: 90,
  slowFrame: 1 / 48,
  warmup: 45,
  fastFrame: 1 / 56,
  upWindows: 3,
  downWindows: 2,
};

/**
 * Watches frame times and picks the best quality level that keeps the game smooth.
 *
 * - Below ~48 fps it steps quality down; at ~60 fps it steps back up.
 * - Every change is checked against the next measurement. Slow frames are not always the
 *   GPU's fault: Low Power Mode and thermal throttling cap web content at 30 fps whatever
 *   is drawn. If lowering quality does not make frames faster, the frame rate is capped,
 *   so the step is undone and quality is not lowered further (until the cap lifts).
 * - If the cheapest level is still slow, a better level is tried; if it costs nothing
 *   (capped) it is kept, if it makes frames slower it is undone and not tried again this
 *   session. So quality never flips back and forth.
 */
export class QualityGovernor {
  level: number;
  /** Frame times of the current window. */
  private readonly samples: Float64Array;
  private frames = 0;
  private warmup: number;
  private fastWindows = 0;
  private slowWindows = 0;
  /** Best (lowest-index) level allowed this session. */
  private ceiling = 0;
  /** Worst (highest-index) level allowed; raised to the current level when a cap is detected. */
  private floor: number;
  /** Average frame time when a cap was detected (0 = no cap). */
  private capAvg = 0;
  /** The last change, to be judged by the next measurement. */
  private lastChange: { dir: 'up' | 'down'; before: number } | null = null;
  private readonly opts: GovernorOptions;

  constructor(
    readonly levels: QualityLevel[],
    startLevel = 0,
    options: Partial<GovernorOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    this.level = Math.min(Math.max(0, Math.floor(startLevel) || 0), levels.length - 1);
    this.floor = levels.length - 1;
    this.warmup = this.opts.warmup;
    this.samples = new Float64Array(this.opts.window);
  }

  /** True while frames are judged to be capped rather than limited by rendering. */
  get capped(): boolean {
    return this.capAvg > 0;
  }

  private step(dir: 'up' | 'down', before: number): true {
    this.level += dir === 'up' ? -1 : 1;
    this.lastChange = { dir, before };
    this.fastWindows = 0;
    this.slowWindows = 0;
    this.warmup = this.opts.warmup;
    return true;
  }

  get current(): QualityLevel {
    return this.levels[this.level];
  }

  /** Call after loading a level or resuming, so the hitch is not counted. */
  reset(): void {
    this.frames = 0;
    this.warmup = this.opts.warmup;
  }

  /** Feeds one frame's duration in seconds. Returns true when the quality level changed. */
  sample(dt: number): boolean {
    // Ignore paused/background gaps; they say nothing about rendering cost.
    if (!(dt > 0) || dt > 0.25) return false;
    if (this.warmup > 0) {
      this.warmup--;
      return false;
    }
    this.samples[this.frames++] = dt;
    if (this.frames < this.opts.window) return false;
    // Judge the window by its typical (lower-median) frame: a brief stall such as a fall,
    // a banner or a hitch can't make a smooth window look slow, but a struggling GPU or
    // a frame-rate cap affects most frames and still shows.
    const sorted = Array.from(this.samples).sort((a, b) => a - b);
    const typical = sorted[Math.floor((sorted.length - 1) / 2)];
    this.frames = 0;
    const last = this.lastChange;
    this.lastChange = null;
    const slow = typical > this.opts.slowFrame;

    // The cap is gone (e.g. Low Power Mode switched off): lowering quality may help again.
    if (this.capAvg && typical < this.capAvg * 0.85) {
      this.capAvg = 0;
      this.floor = this.levels.length - 1;
    }

    if (last?.dir === 'down' && typical > last.before * 0.9) {
      // Lower quality did not speed frames up: they are capped, not limited by rendering.
      this.capAvg = typical;
      this.floor = this.level - 1;
      return this.step('up', typical);
    }
    if (last?.dir === 'up' && slow) {
      if (typical > last.before * 1.12) {
        // The better level made frames slower: undo it and don't try it again this session.
        this.ceiling = this.level + 1;
        return this.step('down', typical);
      }
      // Still slow but no slower: frames are capped and the better level is free. Keep it,
      // don't go back below it, and try the next one.
      this.capAvg = typical;
      this.floor = this.level;
      return this.level > this.ceiling ? this.step('up', typical) : false;
    }
    if (slow) {
      // A single slow window is often a one-off (a fall, a banner, a hitch): wait for a second.
      if (this.level < this.floor) return ++this.slowWindows < this.opts.downWindows ? false : this.step('down', typical);
      // Can't go lower and still slow: a better level may cost nothing (capped frame rate).
      if (this.level > this.ceiling) return this.step('up', typical);
      return false;
    }
    this.slowWindows = 0;
    if (typical < this.opts.fastFrame && this.level > this.ceiling) {
      if (++this.fastWindows < this.opts.upWindows) return false;
      return this.step('up', typical);
    }
    this.fastWindows = 0;
    return false;
  }
}

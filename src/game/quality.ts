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
}

const DEFAULTS: GovernorOptions = { window: 90, slowFrame: 1 / 48, warmup: 45, fastFrame: 1 / 56, upWindows: 3 };

/**
 * Watches frame times: steps quality down while the game cannot hold ~48 fps and back up
 * once it runs at ~60 fps again. Stepping back up matters because slow frames are not
 * always the GPU's fault: Low Power Mode caps web content at 30 fps, and a busy moment
 * (another app, thermal throttling) can pass. A level that fails right after a step up
 * is not tried again during the session, so quality does not flip back and forth.
 */
export class QualityGovernor {
  level: number;
  private frames = 0;
  private time = 0;
  private warmup: number;
  private fastWindows = 0;
  /** Best (lowest-index) level allowed this session. */
  private ceiling = 0;
  /** The last change was a step up that still has to prove itself. */
  private probing = false;
  private readonly opts: GovernorOptions;

  constructor(
    readonly levels: QualityLevel[],
    startLevel = 0,
    options: Partial<GovernorOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
    this.level = Math.min(Math.max(0, Math.floor(startLevel) || 0), levels.length - 1);
    this.warmup = this.opts.warmup;
  }

  get current(): QualityLevel {
    return this.levels[this.level];
  }

  /** Call after loading a level or resuming, so the hitch is not counted. */
  reset(): void {
    this.frames = 0;
    this.time = 0;
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
    this.frames++;
    this.time += dt;
    if (this.frames < this.opts.window) return false;
    const avg = this.time / this.frames;
    this.frames = 0;
    this.time = 0;
    const probing = this.probing;
    this.probing = false;

    if (avg > this.opts.slowFrame) {
      this.fastWindows = 0;
      if (this.level >= this.levels.length - 1) return false;
      this.level++;
      // The better level we just tried could not hold up: stay below it.
      if (probing) this.ceiling = this.level;
      this.warmup = this.opts.warmup;
      return true;
    }
    if (avg < this.opts.fastFrame && this.level > this.ceiling) {
      if (++this.fastWindows < this.opts.upWindows) return false;
      this.fastWindows = 0;
      this.level--;
      this.probing = true;
      this.warmup = this.opts.warmup;
      return true;
    }
    this.fastWindows = 0;
    return false;
  }
}

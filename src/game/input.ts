import type { ControlMode } from './settings';

/** What the player is asking for this frame, in screen space. */
export interface ControlVector {
  /** The player is steering (a finger is down). */
  active: boolean;
  /** Push direction scaled by strength; x right, y up (up = away from the player). */
  x: number;
  y: number;
  /** 0..1 */
  strength: number;
}

/** The touch push indicator: a range ring around the ball and a line to the finger. */
export interface TouchVisual {
  active: boolean;
  cx: number;
  cy: number;
  radius: number;
  x: number;
  y: number;
  strength: number;
}

/** The on-screen joystick: knob offset from the base center in px (screen coords, y down). */
export interface JoystickVisual {
  active: boolean;
  dx: number;
  dy: number;
}

/** Where the joystick base is on screen (px). */
export interface StickGeometry {
  cx: number;
  cy: number;
  r: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const idle = (): ControlVector => ({ active: false, x: 0, y: 0, strength: 0 });

/**
 * Turns an offset (x right, y up) into a push: none inside `dead`, growing to full
 * strength at `full`, always pointing along the offset.
 */
export function pushVector(x: number, y: number, full: number, dead: number): ControlVector {
  const len = Math.hypot(x, y);
  const strength = clamp01((len - dead) / (full - dead));
  if (len < 1e-9) return { active: true, x: 0, y: 0, strength: 0 };
  return { active: true, x: (x / len) * strength, y: (y / len) * strength, strength };
}

// ---------------------------------------------------------------------- touch

/**
 * Single-finger control. The ball sits at the screen center; while a finger is down the
 * ball is pushed toward the finger, harder the farther the finger is from the center.
 */
export class TouchInput {
  onVisual: ((v: TouchVisual) => void) | null = null;
  private enabled = false;
  private pointerId: number | null = null;
  private px = 0;
  private py = 0;

  constructor(surface: HTMLElement) {
    surface.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('blur', () => this.release());
  }

  /** Finger distance (px) that gives full acceleration. */
  radius(): number {
    return Math.min(window.innerWidth, window.innerHeight) * 0.36;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.release();
  }

  vector(): ControlVector {
    if (!this.enabled || this.pointerId === null) return idle();
    const r = this.radius();
    return pushVector(this.px - window.innerWidth / 2, window.innerHeight / 2 - this.py, r, r * 0.06);
  }

  private emit(): void {
    if (!this.onVisual) return;
    const v = this.vector();
    this.onVisual({
      active: v.active,
      cx: window.innerWidth / 2,
      cy: window.innerHeight / 2,
      radius: this.radius(),
      x: this.px,
      y: this.py,
      strength: v.strength,
    });
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.px = e.clientX;
    this.py = e.clientY;
    this.emit();
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.px = e.clientX;
    this.py = e.clientY;
    this.emit();
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) this.release();
  };

  private release(): void {
    if (this.pointerId === null) return;
    this.pointerId = null;
    this.emit();
  }
}

// ---------------------------------------------------------------------- joystick

/**
 * A virtual joystick at a fixed spot (the bottom center of the screen). A touch that starts
 * on the stick, or close to it, grabs it; the knob follows the finger up to the base's rim.
 */
export class JoystickInput {
  /** Touches this many base radii from the center still grab the stick (small fingers miss). */
  static readonly GRAB = 1.6;
  /** Fraction of the base radius that does nothing, so resting a thumb on the knob is still. */
  static readonly DEAD = 0.12;

  onVisual: ((v: JoystickVisual) => void) | null = null;
  private enabled = false;
  private pointerId: number | null = null;
  private base: StickGeometry | null = null;
  private px = 0;
  private py = 0;

  constructor(
    surface: HTMLElement,
    private readonly geometry: () => StickGeometry | null,
  ) {
    surface.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('blur', () => this.release());
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.release();
  }

  vector(): ControlVector {
    const b = this.base;
    if (!this.enabled || this.pointerId === null || !b) return idle();
    return pushVector(this.px - b.cx, b.cy - this.py, b.r, b.r * JoystickInput.DEAD);
  }

  private emit(): void {
    if (!this.onVisual) return;
    const b = this.base;
    if (this.pointerId === null || !b) {
      this.onVisual({ active: false, dx: 0, dy: 0 });
      return;
    }
    let dx = this.px - b.cx;
    let dy = this.py - b.cy;
    const len = Math.hypot(dx, dy);
    if (len > b.r) {
      dx *= b.r / len;
      dy *= b.r / len;
    }
    this.onVisual({ active: true, dx, dy });
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) return;
    const g = this.geometry();
    if (!g || g.r <= 0 || Math.hypot(e.clientX - g.cx, e.clientY - g.cy) > g.r * JoystickInput.GRAB) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.base = g;
    this.px = e.clientX;
    this.py = e.clientY;
    this.emit();
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.px = e.clientX;
    this.py = e.clientY;
    this.emit();
  };

  private up = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) this.release();
  };

  private release(): void {
    if (this.pointerId === null) return;
    this.pointerId = null;
    this.emit();
  }
}

// ---------------------------------------------------------------------- all controls

/** The control modes behind one interface: only the chosen one reacts to touches. */
export class Controls {
  readonly touch: TouchInput;
  readonly joystick: JoystickInput;
  /** The push indicator around the ball (touch mode). */
  onPushVisual: ((v: TouchVisual) => void) | null = null;
  onJoystickVisual: ((v: JoystickVisual) => void) | null = null;
  private enabled = false;

  constructor(
    surface: HTMLElement,
    stickGeometry: () => StickGeometry | null,
    private current: ControlMode,
  ) {
    this.touch = new TouchInput(surface);
    this.touch.onVisual = (v) => this.onPushVisual?.(v);
    this.joystick = new JoystickInput(surface, stickGeometry);
    this.joystick.onVisual = (v) => this.onJoystickVisual?.(v);
    this.apply();
  }

  get mode(): ControlMode {
    return this.current;
  }

  setMode(mode: ControlMode): void {
    this.current = mode;
    this.apply();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.apply();
  }

  vector(): ControlVector {
    return this.current === 'joystick' ? this.joystick.vector() : this.touch.vector();
  }

  private apply(): void {
    this.touch.setEnabled(this.enabled && this.current === 'touch');
    this.joystick.setEnabled(this.enabled && this.current === 'joystick');
  }
}

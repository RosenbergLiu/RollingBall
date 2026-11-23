export interface TouchVector {
  /** A finger is down. */
  active: boolean;
  /** Screen-space push direction scaled by strength; x right, y up. */
  x: number;
  y: number;
  /** 0..1, grows with the finger's distance from the screen center. */
  strength: number;
}

export interface TouchVisual {
  active: boolean;
  cx: number;
  cy: number;
  radius: number;
  x: number;
  y: number;
  strength: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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

  vector(): TouchVector {
    if (!this.enabled || this.pointerId === null) return { active: false, x: 0, y: 0, strength: 0 };
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = this.px - cx;
    const dy = cy - this.py;
    const len = Math.hypot(dx, dy);
    const r = this.radius();
    const dead = r * 0.06;
    const strength = clamp01((len - dead) / (r - dead));
    if (len < 1e-3) return { active: true, x: 0, y: 0, strength: 0 };
    return { active: true, x: (dx / len) * strength, y: (dy / len) * strength, strength };
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

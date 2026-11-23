/**
 * How the player steers the ball:
 * - touch: drag anywhere; the ball is pushed toward the finger (the original control).
 * - joystick: an on-screen stick at the bottom center of the screen.
 */
export const CONTROL_MODES = ['touch', 'joystick'] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

export interface Settings {
  control: ControlMode;
  /** Sound effects on or off. */
  sound: boolean;
}

export const defaultSettings = (): Settings => ({ control: 'touch', sound: true });

/** Cleans stored settings: unknown or broken values fall back to the defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = defaultSettings();
  if (!raw || typeof raw !== 'object') return s;
  const control = (raw as { control?: unknown }).control;
  if (CONTROL_MODES.includes(control as ControlMode)) s.control = control as ControlMode;
  const sound = (raw as { sound?: unknown }).sound;
  if (typeof sound === 'boolean') s.sound = sound;
  return s;
}

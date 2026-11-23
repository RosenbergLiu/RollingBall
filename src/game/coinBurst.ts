import * as THREE from 'three';
import { COIN_HEX, type CoinColor } from './coins';

/**
 * The coin pickup effect: the coin bursts into a shower of sparks in its own color, with a
 * short flash and an expanding ring. Rarer coins burst bigger and leave rising glitter.
 * Sparks are drawn with ordinary (premultiplied) alpha so their color shows on the light
 * tracks too, plus a small additive white glint so they sparkle on dark ones.
 *
 * Built to be cheap on the oldest target iPad (A10X): every particle of every burst lives in
 * one fixed pool drawn as a single `THREE.Points` call. The motion is computed in the vertex
 * shader from each particle's start values, so a frame only updates one time uniform; the
 * buffers are written only on the frame a coin is picked up. Nothing is allocated per frame.
 */

export interface BurstSpec {
  /** Sparks flying out (at full detail). */
  sparks: number;
  /** Their launch speed (m/s). */
  speed: number;
  /** Their lifetime (s). */
  life: number;
  /** Diameter of the flash (m). */
  flash: number;
  /** Slow, twinkling motes rising after the burst (at full detail). */
  glitter: number;
}

export const BURST_SPECS: Record<CoinColor, BurstSpec> = {
  yellow: { sparks: 14, speed: 4, life: 0.55, flash: 2, glitter: 0 },
  blue: { sparks: 18, speed: 4.5, life: 0.6, flash: 2.3, glitter: 4 },
  purple: { sparks: 22, speed: 5, life: 0.65, flash: 2.6, glitter: 8 },
  orange: { sparks: 30, speed: 5.8, life: 0.75, flash: 3.3, glitter: 16 },
};

/** Particles one burst uses at a detail level (0..1, see CoinField). */
export function burstSize(spec: BurstSpec, detail: number): { sparks: number; glitter: number } {
  const d = Math.min(1, Math.max(0.25, detail));
  return { sparks: Math.max(6, Math.round(spec.sparks * d)), glitter: Math.round(spec.glitter * d) };
}

/** Enough for several bursts in flight at once; the oldest particles are reused first. */
export const BURST_POOL = 160;

const KIND_SPARK = 0;
const KIND_FLASH = 1;
const KIND_GLITTER = 2;
const KIND_RING = 3;

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aInfo; // birth time, lifetime, size (m), kind
varying vec3 vColor;
varying float vAlpha;
varying float vKind;

void main() {
  float age = uTime - aInfo.x;
  float t = age / aInfo.y;
  if (age < 0.0 || t >= 1.0) {
    // Idle particle: outside the clip volume, so the GPU drops it before rasterizing.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float kind = aInfo.w;
  float phase = fract(float(gl_VertexID) * 0.618034) * 6.2832;
  vec3 p = position;
  float size = aInfo.z;
  float alpha;
  if (kind < 0.5) {
    // Spark: flies out, slows down (drag), falls (gravity), shrinks and twinkles.
    float drag = 3.5;
    p += aVel * (1.0 - exp(-drag * age)) / drag;
    p.y -= 2.5 * age * age;
    size *= 1.0 - 0.6 * t;
    alpha = (1.0 - t * t) * (0.75 + 0.25 * sin(age * 38.0 + phase));
  } else if (kind < 1.5) {
    // Flash: swells quickly and fades.
    size *= 0.45 + 0.75 * sqrt(t);
    alpha = (1.0 - t) * (1.0 - t);
  } else if (kind < 2.5) {
    // Glitter: drifts upward, fades in and out, twinkling.
    p += aVel * age;
    alpha = sin(t * 3.1416) * (0.55 + 0.45 * sin(age * 22.0 + phase));
  } else {
    // Ring: a shockwave that races outward and thins away.
    size *= 0.3 + 0.7 * sqrt(t);
    alpha = pow(1.0 - t, 1.5);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(size * uScale / max(-mv.z, 0.1), 400.0);
  vColor = aColor;
  vAlpha = alpha;
  vKind = kind;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vKind;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float body;
  float white;
  float glint = 0.0;
  vec3 base = vColor;
  if (vKind < 0.5 || (vKind > 1.5 && vKind < 2.5)) {
    // Spark or glitter: a colored bead with a light core and a four-pointed white glint.
    // A slightly deeper rim keeps light colors (yellow) visible on light tiles.
    body = 1.0 - smoothstep(0.45, 1.0, r);
    white = 1.0 - smoothstep(0.0, 0.45, r);
    base *= mix(1.0, 0.62, smoothstep(0.35, 0.9, r));
    glint = max(0.0, 1.0 - abs(d.x * d.y) * 90.0) * max(0.0, 1.0 - r);
  } else if (vKind < 1.5) {
    // Flash: a soft glow, white in the middle.
    body = pow(max(0.0, 1.0 - r), 1.3);
    white = pow(max(0.0, 1.0 - r), 3.0);
  } else {
    // Ring: a thin circle.
    float x = (r - 0.82) / 0.1;
    body = exp(-x * x);
    white = 0.15;
  }
  float a = body * vAlpha;
  vec3 col = linearToOutputTexel(vec4(mix(base, vec3(1.0), white * 0.8), 1.0)).rgb;
  // Premultiplied: the bead covers what's behind it; the glint only adds light.
  gl_FragColor = vec4(col * a + glint * vAlpha * 0.6, a);
}
`;

/** Coin colors in the renderer's linear working space, as plain numbers. */
const LINEAR: Record<CoinColor, [number, number, number]> = Object.fromEntries(
  (Object.keys(COIN_HEX) as CoinColor[]).map((c) => {
    const col = new THREE.Color(COIN_HEX[c]);
    return [c, [col.r, col.g, col.b]];
  }),
) as Record<CoinColor, [number, number, number]>;
const GOLD = new THREE.Color('#fde68a');

export class CoinBurst {
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly pos = new Float32Array(BURST_POOL * 3);
  private readonly vel = new Float32Array(BURST_POOL * 3);
  private readonly col = new Float32Array(BURST_POOL * 3);
  private readonly info = new Float32Array(BURST_POOL * 4);
  private readonly attrs: THREE.BufferAttribute[];
  private next = 0;

  constructor(private readonly detail = 1) {
    // Every particle starts idle (born long ago).
    for (let i = 0; i < BURST_POOL; i++) {
      this.info[i * 4] = -1e6;
      this.info[i * 4 + 1] = 1;
    }
    this.attrs = [
      new THREE.BufferAttribute(this.pos, 3),
      new THREE.BufferAttribute(this.vel, 3),
      new THREE.BufferAttribute(this.col, 3),
      new THREE.BufferAttribute(this.info, 4),
    ];
    ['position', 'aVel', 'aColor', 'aInfo'].forEach((name, i) => {
      this.attrs[i].setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, this.attrs[i]);
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      // The coin is hit just in front of the ball, so the ball would hide half the burst:
      // draw it on top. Sparks are short-lived and stay near the coin, so this never shows.
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // positions are computed in the shader
    this.points.renderOrder = 2; // after the coins, the ball and the track
    // Point sizes are in pixels: scale world sizes by the drawing buffer's height and the
    // camera's field of view (no allocation: the canvas and projection are read in place).
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      this.material.uniforms.uScale.value = renderer.domElement.height * 0.5 * camera.projectionMatrix.elements[5];
    };
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  /** Bursts a coin of `color` at (x, y, z) at `time`. */
  spawn(color: CoinColor, x: number, y: number, z: number, time: number): void {
    const spec = BURST_SPECS[color];
    const { sparks, glitter } = burstSize(spec, this.detail);
    const [r, g, b] = LINEAR[color];
    // Flash: a soft glow in a lighter tint of the coin's color, and a ring racing outward.
    this.emit(KIND_FLASH, x, y, z, 0, 0, 0, r + (1 - r) * 0.4, g + (1 - g) * 0.4, b + (1 - b) * 0.4, time, 0.2, spec.flash);
    this.emit(KIND_RING, x, y, z, 0, 0, 0, r, g, b, time, 0.32, spec.flash * 1.15);
    for (let i = 0; i < sparks; i++) {
      // Random direction, biased upward so the shower fountains up before falling.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const h = Math.sqrt(1 - u * u);
      let dx = h * Math.cos(a);
      let dy = u + 0.7;
      let dz = h * Math.sin(a);
      const len = Math.hypot(dx, dy, dz) || 1;
      const speed = spec.speed * (0.55 + 0.45 * Math.random());
      dx = (dx / len) * speed;
      dy = (dy / len) * speed;
      dz = (dz / len) * speed;
      // A third of the sparks are near-white (glints), and the jackpot mixes in gold.
      const tint = Math.random() < 0.33 ? 0.6 : 0;
      const gold = color === 'orange' && Math.random() < 0.35;
      const cr = gold ? GOLD.r : r + (1 - r) * tint;
      const cg = gold ? GOLD.g : g + (1 - g) * tint;
      const cb = gold ? GOLD.b : b + (1 - b) * tint;
      const life = spec.life * (0.7 + 0.3 * Math.random());
      this.emit(KIND_SPARK, x, y, z, dx, dy, dz, cr, cg, cb, time, life, 0.22 + Math.random() * 0.16);
    }
    for (let i = 0; i < glitter; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * 0.5;
      this.emit(
        KIND_GLITTER,
        x + Math.cos(a) * rad,
        y - 0.1 + Math.random() * 0.3,
        z + Math.sin(a) * rad,
        (Math.random() - 0.5) * 0.5,
        0.6 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.5,
        r + (1 - r) * 0.5,
        g + (1 - g) * 0.5,
        b + (1 - b) * 0.5,
        time + 0.08 + Math.random() * 0.25,
        0.9 + Math.random() * 0.5,
        0.12 + Math.random() * 0.08,
      );
    }
    for (const attr of this.attrs) attr.needsUpdate = true;
  }

  private emit(
    kind: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    birth: number,
    life: number,
    size: number,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % BURST_POOL;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.info[i * 4] = birth;
    this.info[i * 4 + 1] = life;
    this.info[i * 4 + 2] = size;
    this.info[i * 4 + 3] = kind;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

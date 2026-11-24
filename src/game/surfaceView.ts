import * as THREE from 'three';
import type { BuiltLevel } from './level';
import { buildPatch, emptyMesh, type MeshArrays } from './platform';
import type { BuiltSurface } from './surfaces';
import { canvasTexture, toGeometry } from './view';

/** Boost arrows: one chevron per this many meters along, and across. */
const CHEVRON_LENGTH = 2.5;
const CHEVRON_WIDTH = 3;
/** How fast the arrows scroll forward (chevrons per second). */
const ARROW_SCROLL = 1.6;
/** How long a tile or pad glows after the ball rolls onto it (s). */
const GLOW = 0.6;
/** Gap between neighbouring music tiles, so they read as separate keys (m, each side). */
const TILE_INSET = 0.07;

/** Kids' xylophone colors by pitch class, C = red through B = pink. */
const PITCH_COLORS = [
  '#ef4444', // C
  '#f43f5e', // C#
  '#f97316', // D
  '#f59e0b', // D#
  '#facc15', // E
  '#22c55e', // F
  '#14b8a6', // F#
  '#3b82f6', // G
  '#6366f1', // G#
  '#8b5cf6', // A
  '#a855f7', // A#
  '#ec4899', // B
];

/** A music tile's color: its pitch class, lighter for higher octaves, deeper for lower. */
export function noteColor(semitonesFromC5: number): THREE.Color {
  const pc = ((semitonesFromC5 % 12) + 12) % 12;
  const octave = Math.floor(semitonesFromC5 / 12);
  const c = new THREE.Color(PITCH_COLORS[pc]);
  if (octave > 0) c.lerp(new THREE.Color('#ffffff'), Math.min(0.45, 0.2 * octave));
  if (octave < 0) c.multiplyScalar(Math.max(0.6, 1 + 0.25 * octave));
  return c;
}

function appendMesh(into: MeshArrays, m: MeshArrays): number {
  const base = into.positions.length / 3;
  into.positions.push(...m.positions);
  into.normals.push(...m.normals);
  into.uvs.push(...m.uvs);
  for (const i of m.indices) into.indices.push(i + base);
  return base;
}

function arrowTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = 'rgba(249, 115, 22, 0.42)';
    ctx.fillRect(0, 0, 128, 128);
    // A fat chevron pointing to the top of the canvas (= forward along the track).
    ctx.beginPath();
    ctx.moveTo(14, 104);
    ctx.lineTo(64, 34);
    ctx.lineTo(114, 104);
    ctx.lineTo(88, 104);
    ctx.lineTo(64, 70);
    ctx.lineTo(40, 104);
    ctx.closePath();
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ea580c';
    ctx.stroke();
  });
}

interface TileRange {
  start: number;
  count: number;
  base: THREE.Color;
  hitAt: number;
}

/**
 * The look of a level's surface tiles: scrolling orange arrows on boost pads, and colored
 * xylophone keys for music tiles. Each glows briefly when the ball rolls onto it.
 */
export class SurfaceView {
  readonly group = new THREE.Group();
  private readonly arrows: THREE.MeshBasicMaterial | null = null;
  private readonly arrowMap: THREE.Texture | null = null;
  private boostHitAt = -1;
  private readonly tileColors: THREE.BufferAttribute | null = null;
  private readonly tiles = new Map<number, TileRange>();
  private readonly glowing = new Set<TileRange>();

  constructor(level: BuiltLevel) {
    const boost = emptyMesh();
    const music = emptyMesh();
    const colors: number[] = [];
    for (const x of level.surfaces) {
      if (x.type === 'boost') {
        const m = buildPatch(level, x.s0, x.s1, x.u0, x.u1, 0.022, 0);
        // UVs in chevrons: across every CHEVRON_WIDTH m, along every CHEVRON_LENGTH m.
        for (let i = 0; i < m.uvs.length; i += 2) {
          m.uvs[i] /= CHEVRON_WIDTH;
          m.uvs[i + 1] /= CHEVRON_LENGTH;
        }
        appendMesh(boost, m);
      } else {
        const m = buildPatch(level, x.s0, x.s1, x.u0, x.u1, 0.02, TILE_INSET, 2);
        const start = appendMesh(music, m);
        const count = m.positions.length / 3;
        const base = noteColor(x.note).multiplyScalar(0.85);
        for (let i = 0; i < count; i++) colors.push(base.r, base.g, base.b);
        this.tiles.set(x.index, { start, count, base, hitAt: -1 });
      }
    }
    if (boost.indices.length > 0) {
      this.arrowMap = arrowTexture();
      this.arrows = new THREE.MeshBasicMaterial({
        map: this.arrowMap,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      this.group.add(new THREE.Mesh(toGeometry(boost), this.arrows));
    }
    if (music.indices.length > 0) {
      const g = toGeometry(music);
      this.tileColors = new THREE.Float32BufferAttribute(colors, 3);
      g.setAttribute('color', this.tileColors);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
  }

  /** The ball rolled onto surface `index` (a music tile lights up; boost arrows flare). */
  hit(x: BuiltSurface, time: number): void {
    if (x.type === 'boost') {
      this.boostHitAt = time;
      return;
    }
    const tile = this.tiles.get(x.index);
    if (!tile) return;
    tile.hitAt = time;
    this.glowing.add(tile);
  }

  update(time: number): void {
    if (this.arrows && this.arrowMap) {
      this.arrowMap.offset.y = -((time * ARROW_SCROLL) % 1);
      const t = this.boostHitAt < 0 ? GLOW : time - this.boostHitAt;
      this.arrows.color.setScalar(1 + 1.2 * Math.max(0, 1 - t / GLOW));
    }
    if (!this.tileColors || this.glowing.size === 0) return;
    const arr = this.tileColors.array as Float32Array;
    for (const tile of this.glowing) {
      const t = time - tile.hitAt;
      const f = Math.max(0, 1 - t / GLOW);
      // A bright, near-white flash that settles back into the key's color.
      const k = 1 + 1.6 * f;
      for (let i = tile.start; i < tile.start + tile.count; i++) {
        arr[i * 3] = Math.min(4, tile.base.r * k + f * 0.4);
        arr[i * 3 + 1] = Math.min(4, tile.base.g * k + f * 0.4);
        arr[i * 3 + 2] = Math.min(4, tile.base.b * k + f * 0.4);
      }
      if (f === 0) this.glowing.delete(tile);
    }
    this.tileColors.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    this.arrows?.dispose();
    this.arrowMap?.dispose();
    for (const o of this.group.children) {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      mat?.dispose();
    }
  }
}

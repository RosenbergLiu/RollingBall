import * as THREE from 'three';
import { CoinBurst } from './coinBurst';
import { COIN_COLORS, COIN_HEX, COIN_RADIUS, type CoinColor, type SpawnedCoin } from './coins';

const THICKNESS = 0.08;
const SPIN_SPEED = 2.4;
const BOB_HEIGHT = 0.06;

/** Coin face: colored disc with a rim and a star, so it reads as a coin while spinning. */
function faceTexture(hex: string): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const mid = size / 2;
  const base = new THREE.Color(hex);
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.45).getStyle();
  const dark = base.clone().multiplyScalar(0.6).getStyle();
  const g = ctx.createRadialGradient(mid * 0.8, mid * 0.7, 4, mid, mid, mid);
  g.addColorStop(0, light);
  g.addColorStop(1, hex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(mid, mid, mid - 10, 0, Math.PI * 2);
  ctx.stroke();
  // Five-pointed star.
  ctx.fillStyle = light;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 34 : 14;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Slot {
  coin: SpawnedCoin;
  mesh: THREE.InstancedMesh;
  index: number;
  phase: number;
}

/**
 * All coins of one play, drawn as one instanced mesh per color. A collected coin vanishes
 * in a burst of sparks (coinBurst.ts).
 */
export class CoinField {
  readonly group = new THREE.Group();
  private readonly burst: CoinBurst;
  private readonly slots: Slot[] = [];
  private readonly bySpot = new Map<number, Slot>();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly geometry: THREE.CylinderGeometry;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** `detail` (0..1) thins out the pickup bursts when rendering quality is lowered. */
  constructor(coins: SpawnedCoin[], detail = 1) {
    // Disc standing upright: caps face ±Z, spun around the world's up axis.
    this.geometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, THICKNESS, 32);
    this.geometry.rotateX(Math.PI / 2);
    this.disposables.push(this.geometry);

    for (const color of COIN_COLORS) {
      const list = coins.filter((c) => c.color === color);
      if (list.length === 0) continue;
      const mesh = new THREE.InstancedMesh(this.geometry, this.materials(color), list.length);
      mesh.castShadow = true;
      mesh.frustumCulled = false; // coins move slightly; the set is small
      list.forEach((coin, index) => {
        const slot: Slot = { coin, mesh, index, phase: coin.spot * 0.7 };
        this.slots.push(slot);
        this.bySpot.set(coin.spot, slot);
      });
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.burst = new CoinBurst(detail);
    this.group.add(this.burst.points);
    this.update(0);
  }

  private materials(color: CoinColor): THREE.Material[] {
    const hex = COIN_HEX[color];
    const rare = color === 'orange';
    const edge = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex).multiplyScalar(0.75),
      metalness: 0.8,
      roughness: 0.3,
    });
    const map = faceTexture(hex);
    const face = new THREE.MeshStandardMaterial({
      map,
      metalness: 0.45,
      roughness: 0.35,
      emissive: new THREE.Color(hex),
      emissiveIntensity: rare ? 0.55 : 0.22,
    });
    this.disposables.push(edge, face, map);
    // CylinderGeometry groups: side, top cap, bottom cap.
    return [edge, face, face];
  }

  /** The coin bursts where it hovers right now; it is hidden from the next update on. */
  collect(coin: SpawnedCoin, time: number): void {
    const slot = this.bySpot.get(coin.spot);
    if (!slot) return;
    const p = slot.coin.pos;
    this.burst.spawn(coin.color, p.x, p.y + this.bob(slot, time), p.z, time);
  }

  private bob(s: Slot, time: number): number {
    return Math.sin(time * 2 + s.phase) * BOB_HEIGHT;
  }

  update(time: number): void {
    for (const s of this.slots) {
      this.p.copy(s.coin.pos);
      this.p.y += this.bob(s, time);
      this.q.setFromAxisAngle(this.up, time * SPIN_SPEED + s.phase);
      this.sc.setScalar(s.coin.collected ? 0 : 1);
      this.m.compose(this.p, this.q, this.sc);
      s.mesh.setMatrixAt(s.index, this.m);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    this.burst.update(time);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const d of this.disposables) d.dispose();
    this.burst.dispose();
  }
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BuiltLevel, Theme } from './level';
import { pathAt } from './path';
import { buildStrip, type MeshArrays, type PlatformMesh } from './platform';
import { PHYSICS } from './physics';

export function toGeometry(m: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uvs, 2));
  g.setIndex(m.indices);
  g.computeBoundingSphere();
  return g;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function tileTexture(theme: Theme): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    const s = 128;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? theme.tileA : theme.tileB;
        ctx.fillRect(x * s, y * s, s, s);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x * s, y * s, s, 3);
        ctx.fillRect(x * s, y * s, 3, s);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x * s, y * s + s - 3, s, 3);
        ctx.fillRect(x * s + s - 3, y * s, 3, s);
      }
    }
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * 0.06})` : `rgba(255,255,255,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
}

function checkerTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}

function bannerTexture(): THREE.CanvasTexture {
  const t = canvasTexture(1024, 160, (ctx) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 160);
    const sq = 20;
    for (let x = 0; x < 1024; x += sq) {
      for (const y of [0, 140]) {
        ctx.fillStyle = (x / sq + y / sq) % 2 === 0 ? '#f8fafc' : '#0f172a';
        ctx.fillRect(x, y, sq, sq);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 92px -apple-system, "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', 512, 84);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function dotTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** Polished steel ball. Faint engraved bands make the rolling visible. */
export function createBall(): THREE.Mesh {
  const tex = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#f1f4f8';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#606a78';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(512, 128);
    for (const x of [0, 128, 256, 384]) {
      ctx.moveTo(x + 3, 0);
      ctx.lineTo(x + 3, 256);
    }
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8a93a0';
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(512, 64);
    ctx.moveTo(0, 192);
    ctx.lineTo(512, 192);
    ctx.stroke();
  });
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, metalness: 1, roughness: 0.16, envMapIntensity: 2.2 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(PHYSICS.ballRadius, 64, 32), mat);
  mesh.castShadow = true;
  return mesh;
}

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
varying vec3 vWorld;
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.45));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const SUN_OFFSET = new THREE.Vector3(10, 22, 6);

/** Sky, fog, lights and reflections. */
export class Environment {
  readonly sun = new THREE.DirectionalLight(0xffffff, 1.9);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.45);
  private readonly fog = new THREE.Fog(0x000000, 45, 190);
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -18;
    cam.right = cam.top = 18;
    cam.near = 1;
    cam.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target, this.hemi);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        top: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    scene.fog = this.fog;
  }

  setShadowMapSize(size: number): void {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    // Drop the old render target; three.js recreates it at the new size.
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  setTheme(theme: Theme): void {
    const u = this.skyMat.uniforms;
    (u.top.value as THREE.Color).set(theme.skyTop);
    (u.horizon.value as THREE.Color).set(theme.horizon);
    (u.bottom.value as THREE.Color).set(theme.horizon).multiplyScalar(0.12);
    this.fog.color.set(theme.horizon);
    this.hemi.color.set(theme.horizon).lerp(new THREE.Color(0xffffff), 0.6);
    this.hemi.groundColor.set(theme.side);
  }

  follow(target: THREE.Vector3, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
    this.sun.position.copy(target).add(SUN_OFFSET);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.scene.environment?.dispose();
  }
}

/** All meshes that make up one level. */
export class LevelView {
  readonly group = new THREE.Group();
  private readonly bannerMat: THREE.MeshBasicMaterial;

  constructor(level: BuiltLevel, platform: PlatformMesh) {
    const theme = level.def.theme;
    const topMat = new THREE.MeshStandardMaterial({ map: tileTexture(theme), roughness: 0.82, metalness: 0.0 });
    const sideMat = new THREE.MeshStandardMaterial({ color: theme.side, roughness: 0.8, metalness: 0.15 });
    const rimMat = new THREE.MeshBasicMaterial({ color: theme.rim, toneMapped: false });

    const top = new THREE.Mesh(toGeometry(platform.top), topMat);
    top.receiveShadow = true;
    top.castShadow = true;
    const walls = new THREE.Mesh(toGeometry(platform.walls), sideMat);
    walls.receiveShadow = true;
    walls.castShadow = true;
    const bottom = new THREE.Mesh(toGeometry(platform.bottom), sideMat);
    const rim = new THREE.Mesh(toGeometry(platform.rim), rimMat);
    this.group.add(top, walls, bottom, rim);

    // Finish line: checkered strip on the surface plus a gate with a banner.
    const checker = checkerTexture();
    const strip = new THREE.Mesh(
      toGeometry(buildStrip(level, level.finishS - 0.6, level.finishS + 0.6, 0.015)),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 }),
    );
    strip.receiveShadow = true;
    this.group.add(strip);

    const f = pathAt(level.path, level.finishS);
    const w = level.widthAt(level.finishS);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.25 });
    const postGeo = new THREE.CylinderGeometry(0.13, 0.13, 4.6, 20);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(f.pos).addScaledVector(f.right, side * (w / 2 + 0.4));
      post.position.y += 4.6 / 2 - 0.9;
      post.castShadow = true;
      this.group.add(post);
    }
    this.bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture(), toneMapped: false });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.8, 0.14), [
      sideMat,
      sideMat,
      sideMat,
      sideMat,
      this.bannerMat,
      this.bannerMat,
    ]);
    banner.position.copy(f.pos);
    banner.position.y += 3.4;
    banner.lookAt(banner.position.clone().add(new THREE.Vector3(f.tan.x, 0, f.tan.z)));
    banner.castShadow = true;
    this.group.add(banner);

    this.group.add(this.createParticles(level, theme));
  }

  /** Floating specks around the level give a sense of speed and depth. */
  private createParticles(level: BuiltLevel, theme: Theme): THREE.Points {
    const box = new THREE.Box3();
    for (const s of level.path.samples) box.expandByPoint(s.pos);
    box.expandByVector(new THREE.Vector3(30, 18, 30));
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random());
      pos[i * 3 + 1] = THREE.MathUtils.lerp(box.min.y, box.max.y, Math.random());
      pos[i * 3 + 2] = THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      size: 0.32,
      map: dotTexture(),
      color: theme.rim,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      sizeAttenuation: true,
    });
    return new THREE.Points(g, m);
  }

  update(time: number): void {
    this.bannerMat.color.setScalar(0.85 + 0.15 * Math.sin(time * 4));
  }

  dispose(): void {
    const seen = new Set<unknown>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry && !seen.has(mesh.geometry)) {
        seen.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        const map = (mat as THREE.MeshStandardMaterial).map;
        if (map && !seen.has(map)) {
          seen.add(map);
          map.dispose();
        }
        mat.dispose();
      }
    });
  }
}

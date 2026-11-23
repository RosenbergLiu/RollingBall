/**
 * Renders the app icon and the launch screen with the game's own 3D assets (the steel
 * ball, tile texture, sky and lighting) and saves them to resources/ via the dev server.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildLevel, BALL_RADIUS, type LevelDef } from '../src/game/level';
import { pathAt, right, straight } from '../src/game/path';
import { buildPlatform } from '../src/game/platform';
import { Environment, LevelView, createBall } from '../src/game/view';

const status = document.getElementById('status')!;
const out = document.getElementById('out')!;

/** Brand colors: the level-1 blue platform under a navy → violet sky (as the menu buttons). */
const ICON_LEVEL: LevelDef = {
  id: 0,
  name: 'icon',
  tagline: '',
  grade: 0.12,
  segments: [straight(14), right(80, 13), straight(40)],
  width: [[0, 6]],
  theme: {
    tileA: '#2f6fe4',
    tileB: '#8fbaf9',
    side: '#1b2f7a',
    rim: '#e8f4ff',
    skyTop: '#070c24',
    horizon: '#7a63d8',
  },
};

function makeRenderer(size: number, alpha = false): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  if (alpha) r.setClearColor(0x000000, 0);
  return r;
}

/** Downsamples a (supersampled) canvas into a new 2D canvas of the given size. */
function downsample(src: HTMLCanvasElement, size: number, background?: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  background?.(ctx);
  ctx.drawImage(src, 0, 0, size, size);
  return c;
}

function renderIcon(): HTMLCanvasElement {
  const SS = 2048; // render at 2× and downsample for clean edges
  const renderer = makeRenderer(SS);
  const scene = new THREE.Scene();
  const env = new Environment(renderer, scene);
  env.setTheme(ICON_LEVEL.theme);
  env.setShadowMapSize(4096);

  const level = buildLevel(ICON_LEVEL);
  const view = new LevelView(level, buildPlatform(level));
  view.group.traverse((o) => {
    if ((o as THREE.Points).isPoints) o.visible = false; // no floating specks in the icon
  });
  scene.add(view.group);

  const s = 9.5;
  const f = pathAt(level.path, s);
  const ball = createBall();
  ball.position.copy(f.pos).addScaledVector(f.normal, BALL_RADIUS);
  ball.rotation.set(0.55, 0.9, -0.35); // tilt the engraved bands so it reads as rolling
  scene.add(ball);

  const fwd = new THREE.Vector3(f.tan.x, 0, f.tan.z).normalize();
  // Looking down at the ball from behind and to the left: the tiles run past it and curve
  // away to the upper right over the dark violet void below the sky.
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
  camera.position
    .copy(ball.position)
    .addScaledVector(fwd, -2.5)
    .addScaledVector(f.right, -0.75)
    .add(new THREE.Vector3(0, 1.75, 0));
  const look = ball.position.clone().addScaledVector(fwd, 0.75).addScaledVector(f.right, 0.3);
  camera.lookAt(look);
  env.follow(ball.position, camera);

  renderer.render(scene, camera);
  const result = downsample(renderer.domElement, 1024);
  renderer.dispose();
  return result;
}

function renderSplash(): HTMLCanvasElement {
  const SIZE = 2732;
  const renderer = makeRenderer(SIZE, true);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-3, 4, 5);
  scene.add(key);

  const ball = createBall();
  ball.rotation.set(0.55, 0.9, -0.35);
  scene.add(ball);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.3, 7.2);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);

  // Dark game background with a soft blue glow behind the ball.
  const result = downsample(renderer.domElement, SIZE, (ctx) => {
    ctx.fillStyle = '#070b18';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE * 0.32);
    g.addColorStop(0, 'rgba(70, 110, 220, 0.38)');
    g.addColorStop(0.45, 'rgba(90, 80, 200, 0.12)');
    g.addColorStop(1, 'rgba(7, 11, 24, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  });
  pmrem.dispose();
  renderer.dispose();
  return result;
}

async function save(canvas: HTMLCanvasElement, name: string, previewSize: number, cls = ''): Promise<string> {
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  const res = await fetch(`/__save-artwork?name=${name}`, { method: 'POST', body: blob });
  const img = new Image(previewSize, previewSize);
  img.src = URL.createObjectURL(blob);
  img.className = cls;
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = `${name} — ${res.ok ? 'saved to resources/' : `not saved (${res.status})`}`;
  fig.append(img, cap);
  out.append(fig);
  return `${name}: ${res.ok ? 'saved' : 'failed'}`;
}

async function main(): Promise<void> {
  const results = [
    await save(renderIcon(), 'icon-1024.png', 512),
    await save(renderSplash(), 'splash-2732.png', 512, 'splash'),
  ];
  status.textContent = results.join(' · ');
  (window as unknown as { artDone: string[] }).artDone = results;
}

main().catch((err) => {
  status.textContent = `Failed: ${err}`;
  console.error(err);
});

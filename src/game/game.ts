import * as THREE from 'three';
import { UI, type UIHandlers } from '../ui/ui';
import { Autopilot } from './autopilot';
import { haptics } from './haptics';
import { TouchInput } from './input';
import { buildLevel, hasFallen, hasFinished, spawnPoint, type BuiltLevel } from './level';
import { LEVELS } from './levels';
import { PhysicsWorld, PHYSICS, type Vec3 } from './physics';
import { buildPlatform } from './platform';
import { isUnlocked, nextPlayableLevel, recordCompletion, type ProgressData } from './progress';
import { saveProgress } from './storage';
import { buildQualityLevels, QualityGovernor } from './quality';
import { PathTracker } from './tracker';
import { Environment, LevelView, createBall } from './view';

const QUALITY_KEY = 'rolling-ball-quality-v1';

function loadQualityLevel(): number {
  try {
    return Number(localStorage.getItem(QUALITY_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function saveQualityLevel(level: number): void {
  try {
    localStorage.setItem(QUALITY_KEY, String(level));
  } catch {
    // Storage unavailable: the governor simply re-measures next launch.
  }
}

type Mode = 'attract' | 'play';
type Phase = 'rolling' | 'fallen' | 'won';

const CAMERA_BACK = 9;
const CAMERA_UP = 5.5;
const FALL_RESPAWN_DELAY = 1.7;
const ATTRACT_RESPAWN_DELAY = 2.5;
const MAX_STEPS_PER_FRAME = 6;
const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  private readonly physics = new PhysicsWorld();
  private readonly env: Environment;
  private readonly ball: THREE.Mesh;
  private readonly ui: UI;
  private readonly input: TouchInput;
  private readonly quality = new QualityGovernor(buildQualityLevels(window.devicePixelRatio), loadQualityLevel());

  private level: BuiltLevel | null = null;
  private view: LevelView | null = null;
  private tracker: PathTracker | null = null;
  private autopilot: Autopilot | null = null;

  private mode: Mode = 'attract';
  private phase: Phase = 'rolling';
  private paused = false;
  private phaseTime = 0;
  private runTime = 0;
  private timerRunning = false;
  private falls = 0;
  /** Debug aid: the autopilot plays in play mode (set from the console). */
  autoplay = false;

  private accumulator = 0;
  private lastTime = 0;
  private elapsed = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currQuat = new THREE.Quaternion();
  private readonly renderPos = new THREE.Vector3();
  private readonly camHeading = new THREE.Vector3(0, 0, -1);
  private readonly camPos = new THREE.Vector3();
  private camFrozen = false;
  private readonly accel: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(
    root: HTMLElement,
    private progress: ProgressData,
  ) {
    const canvas = document.createElement('canvas');
    canvas.className = 'scene';
    root.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality.current.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.env = new Environment(this.renderer, this.scene);
    this.env.setShadowMapSize(this.quality.current.shadowMapSize);
    this.ball = createBall();
    this.scene.add(this.ball);

    const handlers: UIHandlers = {
      play: () => this.startLevel(nextPlayableLevel(this.progress, LEVELS.length)),
      levels: () => this.ui.showLevels(this.progress),
      select: (id) => {
        if (isUnlocked(this.progress, id)) this.startLevel(id);
      },
      menu: () => this.showMenu(),
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      restart: () => {
        this.falls = 0;
        this.setPaused(false);
        this.respawn();
      },
      next: () => {
        const id = (this.level?.def.id ?? 0) + 1;
        if (id <= LEVELS.length && isUnlocked(this.progress, id)) this.startLevel(id);
      },
      replay: () => this.startLevel(this.level?.def.id ?? 1),
    };
    this.ui = new UI(root, LEVELS, handlers);
    this.input = new TouchInput(canvas);
    this.input.onVisual = (v) => this.ui.setTouch(v);

    window.addEventListener('resize', this.resize);
    // Leaving the app (home gesture, app switcher, a Screen Time limit or Downtime
    // covering it) pauses the run so nothing happens while the player is away.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play' && this.phase !== 'won') this.setPaused(true);
      if (!document.hidden) this.quality.reset();
    });
    this.resize();
  }

  start(): void {
    this.showMenu();
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- flow

  private showMenu(): void {
    this.paused = false;
    this.loadLevel(Math.min(this.progress.unlocked, LEVELS.length), 'attract');
    this.ui.showMenu(nextPlayableLevel(this.progress, LEVELS.length));
  }

  private startLevel(id: number): void {
    this.paused = false;
    this.loadLevel(id, 'play');
    this.ui.showPlaying(this.level!.def);
  }

  private loadLevel(id: number, mode: Mode): void {
    const def = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
    if (this.view) {
      this.scene.remove(this.view.group);
      this.view.dispose();
    }
    const level = buildLevel(def);
    const platform = buildPlatform(level);
    this.physics.setPlatform(platform.topCollider, platform.wallCollider);
    this.view = new LevelView(level, platform);
    this.scene.add(this.view.group);
    this.env.setTheme(def.theme);
    this.level = level;
    this.tracker = new PathTracker(level);
    this.autopilot = new Autopilot(level);
    this.mode = mode;
    this.falls = 0;
    this.input.setEnabled(mode === 'play');
    this.respawn();
    this.quality.reset();
  }

  /** Applies the governor's current render resolution and shadow detail. */
  private applyQuality(): void {
    const q = this.quality.current;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.env.setShadowMapSize(q.shadowMapSize);
    saveQualityLevel(this.quality.level);
    console.info(`Rendering quality → level ${this.quality.level}`, q);
  }

  private respawn(): void {
    const level = this.level!;
    const p = spawnPoint(level);
    this.physics.placeBall(p);
    this.physics.setBraking(false);
    this.tracker!.reset(level.spawnS);
    this.currPos.copy(p);
    this.prevPos.copy(p);
    this.renderPos.copy(p);
    this.currQuat.identity();
    this.prevQuat.identity();
    this.phase = 'rolling';
    this.phaseTime = 0;
    this.runTime = 0;
    this.timerRunning = false;
    this.camFrozen = false;
    this.accumulator = 0;
    this.updateCamera(0, true);
    if (this.mode === 'play') {
      this.ui.showGameOver(false);
      this.ui.showHint(true);
      this.ui.updateHud(0, this.falls, 0);
    }
  }

  private setPaused(on: boolean): void {
    if (this.mode !== 'play' || (on && this.phase === 'won')) return;
    this.paused = on;
    this.input.setEnabled(!on);
    this.ui.showPause(on);
  }

  private onFall(): void {
    this.phase = 'fallen';
    this.phaseTime = 0;
    this.camFrozen = true;
    if (this.mode !== 'play') return;
    this.falls++;
    this.ui.showGameOver(true);
    haptics.fall();
  }

  private onWin(): void {
    this.phase = 'won';
    this.phaseTime = 0;
    this.physics.setBraking(true);
    if (this.mode !== 'play') return;
    const def = this.level!.def;
    const result = recordCompletion(this.progress, def.id, this.runTime, LEVELS.length);
    this.progress = result.progress;
    void saveProgress(this.progress);
    haptics.win();
    const next = LEVELS.find((l) => l.id === def.id + 1);
    this.ui.showWin({
      levelId: def.id,
      name: def.name,
      time: this.runTime,
      best: result.best,
      newBest: result.newBest,
      falls: this.falls,
      nextName: next?.name ?? null,
      unlockedNext: result.unlockedNext,
    });
  }

  // ---------------------------------------------------------------- simulation

  private computeControl(): void {
    const a = this.accel;
    a.x = a.y = a.z = 0;
    if (this.phase !== 'rolling') return;
    if (this.mode === 'attract' || this.autoplay) {
      if (this.mode === 'play' && !this.timerRunning) {
        this.timerRunning = true;
        this.ui.showHint(false);
      }
      this.autopilot!.compute(this.tracker!, this.currPos, this.physics.ball.linvel(), a);
      return;
    }
    const v = this.input.vector();
    if (!v.active) return;
    if (!this.timerRunning) {
      this.timerRunning = true;
      this.ui.showHint(false);
    }
    if (v.strength === 0) return;
    // Screen up = camera forward on the ground plane, screen right = camera right.
    const fwd = this.camera.getWorldDirection(this.tmpA);
    fwd.y = 0;
    fwd.normalize();
    const right = this.tmpB.crossVectors(fwd, UP).normalize();
    a.x = (right.x * v.x + fwd.x * v.y) * PHYSICS.maxAccel;
    a.z = (right.z * v.x + fwd.z * v.y) * PHYSICS.maxAccel;
  }

  private fixedStep(): void {
    const level = this.level!;
    const tracker = this.tracker!;
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.computeControl();
    this.physics.setAcceleration(this.accel);
    this.physics.step();
    const t = this.physics.ball.translation();
    const r = this.physics.ball.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
    tracker.update(this.currPos);
    if (this.phase === 'won') {
      if (hasFallen(level, tracker, t.y)) this.camFrozen = true;
      return;
    }
    if (this.phase !== 'rolling') return;
    if (this.mode === 'play' && this.timerRunning) this.runTime += PHYSICS.dt;
    if (hasFallen(level, tracker, t.y)) this.onFall();
    else if (hasFinished(level, tracker)) this.onWin();
  }

  private updatePhase(dt: number): void {
    if (this.phase === 'rolling') return;
    this.phaseTime += dt;
    if (this.phase === 'fallen' && this.phaseTime >= (this.mode === 'play' ? FALL_RESPAWN_DELAY : 1.2)) {
      this.respawn();
    } else if (this.phase === 'won' && this.mode === 'attract' && this.phaseTime >= ATTRACT_RESPAWN_DELAY) {
      this.respawn();
    }
  }

  // ---------------------------------------------------------------- rendering

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const rawDt = this.lastTime ? (now - this.lastTime) / 1000 : 0;
    const dt = Math.min(rawDt, 0.1);
    this.lastTime = now;
    this.elapsed += dt;
    if (this.quality.sample(rawDt)) this.applyQuality();

    if (this.level && !this.paused) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= PHYSICS.dt && steps < MAX_STEPS_PER_FRAME) {
        this.fixedStep();
        this.accumulator -= PHYSICS.dt;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
      this.updatePhase(dt);
    }

    const alpha = this.paused ? 1 : Math.min(this.accumulator / PHYSICS.dt, 1);
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.ball.position.copy(this.renderPos);
    this.ball.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    if (!this.paused) this.updateCamera(dt);
    this.env.follow(this.renderPos, this.camera);
    this.view?.update(this.elapsed);
    if (this.mode === 'play' && this.level && this.tracker) {
      this.ui.updateHud(this.runTime, this.falls, this.tracker.s / this.level.finishS);
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Chase camera behind the ball along the path; always looks straight at the ball. */
  private updateCamera(dt: number, snap = false): void {
    if (!this.tracker) return;
    const target = this.tracker.heading(this.tmpA);
    if (snap) this.camHeading.copy(target);
    else {
      this.camHeading.lerp(target, 1 - Math.exp(-dt * 2.2));
      if (this.camHeading.lengthSq() < 1e-6) this.camHeading.copy(target);
      this.camHeading.normalize();
    }
    if (!this.camFrozen) {
      const desired = this.tmpB.copy(this.renderPos).addScaledVector(this.camHeading, -CAMERA_BACK);
      desired.y += CAMERA_UP;
      if (snap) this.camPos.copy(desired);
      else this.camPos.lerp(desired, 1 - Math.exp(-dt * 9));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.renderPos);
  }

  private resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep a comfortable horizontal view in portrait.
    this.camera.fov = this.camera.aspect >= 1 ? 55 : 72;
    this.camera.updateProjectionMatrix();
  };
}

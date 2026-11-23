import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_RADIUS } from './level';

export const PHYSICS = {
  dt: 1 / 60,
  gravity: 16,
  ballRadius: BALL_RADIUS,
  ballFriction: 1.0,
  platformFriction: 0.9,
  linearDamping: 0.12,
  angularDamping: 0.35,
  /** Damping used after crossing the finish line so the ball comes to rest. */
  brakingDamping: 3,
  /** Acceleration applied at full touch distance (m/s²). */
  maxAccel: 24,
  /** Above this speed the player's forward push starts fading out… */
  softSpeed: 11,
  /** …and at this speed it can no longer speed the ball up. */
  maxSpeed: 17,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

let ready: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly ball: RAPIER.RigidBody;
  private platform: RAPIER.RigidBody | null = null;
  private readonly accel: Vec3 = { x: 0, y: 0, z: 0 };

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.dt;
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setLinearDamping(PHYSICS.linearDamping)
        .setAngularDamping(PHYSICS.angularDamping),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(PHYSICS.ballRadius)
        .setFriction(PHYSICS.ballFriction)
        .setRestitution(0.05)
        .setDensity(1),
      this.ball,
    );
  }

  /**
   * Replaces the level geometry. The walkable top surface uses internal-edge fixing so the
   * ball rolls smoothly across triangle seams; the slab walls are a separate plain mesh.
   */
  setPlatform(top: { vertices: Float32Array; indices: Uint32Array }, walls: { vertices: Float32Array; indices: Uint32Array }): void {
    if (this.platform) this.world.removeRigidBody(this.platform);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.platform = body;
    const make = (m: { vertices: Float32Array; indices: Uint32Array }, flags?: RAPIER.TriMeshFlags) =>
      RAPIER.ColliderDesc.trimesh(m.vertices, m.indices, flags).setFriction(PHYSICS.platformFriction).setRestitution(0);
    try {
      this.world.createCollider(make(top, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES), body);
    } catch (err) {
      console.warn('Trimesh with internal-edge fixing failed, falling back to plain trimesh', err);
      this.world.createCollider(make(top), body);
    }
    if (walls.indices.length > 0) this.world.createCollider(make(walls), body);
  }

  placeBall(p: Vec3): void {
    this.ball.setTranslation(p, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.setAcceleration({ x: 0, y: 0, z: 0 });
  }

  setAcceleration(a: Vec3): void {
    this.accel.x = a.x;
    this.accel.y = a.y;
    this.accel.z = a.z;
  }

  setBraking(on: boolean): void {
    this.ball.setLinearDamping(on ? PHYSICS.brakingDamping : PHYSICS.linearDamping);
    this.ball.setAngularDamping(on ? PHYSICS.brakingDamping : PHYSICS.angularDamping);
  }

  step(): void {
    const a = this.accel;
    if (a.x !== 0 || a.y !== 0 || a.z !== 0) {
      let { x, y, z } = a;
      // The player's push fades out along the direction of travel near top speed, so the
      // ball can't be driven arbitrarily fast. Braking and steering are unaffected.
      const v = this.ball.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > PHYSICS.softSpeed) {
        const along = (x * v.x + y * v.y + z * v.z) / speed;
        if (along > 0) {
          const keep = Math.max(0, (PHYSICS.maxSpeed - speed) / (PHYSICS.maxSpeed - PHYSICS.softSpeed));
          const remove = along * (1 - keep);
          x -= (v.x / speed) * remove;
          y -= (v.y / speed) * remove;
          z -= (v.z / speed) * remove;
        }
      }
      const k = this.ball.mass() * PHYSICS.dt;
      this.ball.applyImpulse({ x: x * k, y: y * k, z: z * k }, true);
    }
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}

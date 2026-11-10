import * as THREE from 'three';
import { PLAYER } from '../core/config.js';
import { clamp, lerp, damp } from '../core/util.js';

// 1인칭 플레이어: 이동(걷기·질주·앉기·점프), 시점, 반동, 체력과 자동 회복, 카메라 흔들림.

export function createPlayer(G) {
  const cam = G.camera, phys = G.physics, ev = G.events;
  const body = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    radius: PLAYER.radius, height: PLAYER.height, step: PLAYER.step, airStep: PLAYER.airStep,
    onGround: true, landed: 0, surface: 'asphalt',
  };
  const fwd = new THREE.Vector3();
  let viewY = 0, stepAcc = 0, deadT = 0;

  const p = {
    body, pos: body.pos, vel: body.vel,
    yaw: 0, pitch: 0, health: PLAYER.health, maxHealth: PLAYER.health, alive: true, enabled: false, god: false,
    onGround: true, sprinting: false, crouching: false, crouchT: 0, ads: 0, speed: 0,
    bobPhase: 0, bobX: 0, bobY: 0, landDip: 0, lean: 0,
    recoil: { pitch: 0, yaw: 0 }, shake: 0, lastDamageT: -99, baseFov: PLAYER.fov, adsFov: 50, sprintBlend: 0,
    eye: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0),
    surface: 'asphalt', damageTaken: 0,

    reset(start) {
      body.pos.copy(start.pos); body.vel.set(0, 0, 0); body.onGround = true; body.height = PLAYER.height;
      p.yaw = start.yaw || 0; p.pitch = 0; p.health = p.maxHealth; p.alive = true;
      p.crouchT = 0; p.ads = 0; p.recoil.pitch = 0; p.recoil.yaw = 0; p.shake = 0; p.landDip = 0; p.lastDamageT = -99;
      viewY = body.pos.y; deadT = 0;
      p.syncCamera(0);
    },

    damage(amount, from) {
      if (!p.alive || p.god) return;
      p.health = Math.max(0, p.health - amount);
      p.damageTaken += amount;
      p.lastDamageT = G.time.t;
      p.shake = Math.min(1, p.shake + amount / 45);
      G.render.state.damage = Math.min(1, G.render.state.damage + amount / 34);
      ev.emit('player/hurt', { amount, from, health: p.health });
      if (p.health <= 0) { p.alive = false; deadT = 0; ev.emit('player/down', { from }); }
    },
    heal(v) { p.health = Math.min(p.maxHealth, p.health + v); },
    addRecoil(pitch, yaw) {
      // 일부는 조준점을 실제로 밀어 올리고, 나머지는 금방 되돌아온다.
      p.pitch = clamp(p.pitch + pitch * 0.34, -1.5, 1.5);
      p.yaw += yaw * 0.3;
      p.recoil.pitch += pitch * 0.66; p.recoil.yaw += yaw * 0.7;
    },
    addShake(a) { p.shake = Math.min(1.2, p.shake + a); },

    syncCamera(dt) {
      const t = G.time.t;
      const eyeH = lerp(PLAYER.eye, PLAYER.crouchEye, p.crouchT) - p.landDip + p.bobY;
      viewY = dt > 0 && body.onGround ? damp(viewY, body.pos.y, 20, dt) : body.pos.y;
      const sh = p.shake * p.shake;
      const sx = Math.sin(t * 61.3) * sh * 0.02, sy = Math.sin(t * 47.9 + 1.7) * sh * 0.02, sr = Math.sin(t * 53.1 + 0.6) * sh * 0.03;
      let y = viewY + eyeH, roll = p.lean + sr;
      if (!p.alive) { const k = Math.min(1, deadT / 0.9); y = lerp(y, body.pos.y + 0.32, k * k); roll += k * 0.9; }
      cam.position.set(body.pos.x + p.right.x * p.bobX, y, body.pos.z + p.right.z * p.bobX);
      cam.rotation.set(clamp(p.pitch + p.recoil.pitch + sx, -1.54, 1.54), p.yaw + p.recoil.yaw + sy, roll);
      const fov = lerp(p.baseFov + p.sprintBlend * 5, p.adsFov, p.ads);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      p.eye.copy(cam.position);
      cam.getWorldDirection(p.forward);
    },

    update(dt) {
      const inp = G.input;
      if (!p.alive) { deadT += dt; body.vel.x *= 0.9; body.vel.z *= 0.9; body.vel.y -= PLAYER.gravity * dt; phys.moveBody(body, dt); p.syncCamera(dt); return; }
      if (!p.enabled) { p.syncCamera(dt); return; }

      // 시점
      const sens = lerp(1, 0.6, p.ads);
      p.yaw -= inp.look.dx * sens;
      p.pitch = clamp(p.pitch - inp.look.dy * sens, -1.5, 1.5);
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      fwd.set(-sin, 0, -cos);
      p.right.set(cos, 0, -sin);

      // 자세
      p.crouching = inp.crouch;
      p.crouchT = damp(p.crouchT, p.crouching ? 1 : 0, 12, dt);
      body.height = lerp(PLAYER.height, PLAYER.crouchHeight, p.crouchT);
      const wantSprint = inp.sprint && inp.move.y > 0.5 && !p.crouching && body.onGround && p.ads < 0.2;
      p.sprinting = wantSprint;
      p.sprintBlend = damp(p.sprintBlend, wantSprint ? 1 : 0, 8, dt);
      const target = (p.crouching ? PLAYER.crouch : p.sprinting ? PLAYER.sprint : PLAYER.walk) * lerp(1, PLAYER.adsMul, p.ads);

      // 이동
      const wx = (p.right.x * inp.move.x + fwd.x * inp.move.y) * target, wz = (p.right.z * inp.move.x + fwd.z * inp.move.y) * target;
      const a = 1 - Math.exp(-(body.onGround ? 12 : 2.4) * dt);
      body.vel.x += (wx - body.vel.x) * a; body.vel.z += (wz - body.vel.z) * a;
      if (inp.jumpPressed && body.onGround) { body.vel.y = PLAYER.jump; body.onGround = false; ev.emit('player/jump', {}); }
      body.vel.y -= PLAYER.gravity * dt;
      phys.moveBody(body, dt);
      p.onGround = body.onGround; p.surface = body.surface;
      if (body.landed > 3.2) {
        p.landDip = Math.min(0.2, body.landed * 0.02);
        ev.emit('player/land', { speed: body.landed, surface: body.surface });
      }
      p.landDip = damp(p.landDip, 0, 9, dt);

      // 보행 흔들림과 발소리
      p.speed = Math.hypot(body.vel.x, body.vel.z);
      const moving = body.onGround && p.speed > 0.7;
      if (moving) {
        const rate = (p.sprinting ? 11.6 : p.crouching ? 6.2 : 8.4) * clamp(p.speed / Math.max(1, target), 0.5, 1.15);
        p.bobPhase += dt * rate;
        stepAcc += dt * rate;
        if (stepAcc > Math.PI) { stepAcc -= Math.PI; ev.emit('player/step', { surface: body.surface, sprint: p.sprinting, crouch: p.crouching }); }
      }
      const amp = moving ? (p.sprinting ? 1.5 : 1) * lerp(1, 0.25, p.ads) * lerp(1, 0.6, p.crouchT) : 0;
      p.bobX = damp(p.bobX, Math.cos(p.bobPhase) * 0.018 * amp, 14, dt);
      p.bobY = damp(p.bobY, -Math.abs(Math.sin(p.bobPhase)) * 0.034 * amp, 14, dt);
      p.lean = damp(p.lean, -inp.move.x * 0.014 * (body.onGround ? 1 : 0.3), 8, dt);

      // 반동 회복, 흔들림 감쇠, 체력 회복
      p.recoil.pitch = damp(p.recoil.pitch, 0, 9, dt);
      p.recoil.yaw = damp(p.recoil.yaw, 0, 9, dt);
      p.shake = Math.max(0, p.shake - dt * 2.4);
      if (p.health < p.maxHealth && G.time.t - p.lastDamageT > PLAYER.regenDelay) p.health = Math.min(p.maxHealth, p.health + PLAYER.regenRate * dt);

      p.syncCamera(dt);
    },
  };
  return p;
}

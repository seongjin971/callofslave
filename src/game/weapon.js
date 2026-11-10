import * as THREE from 'three';
import { WEAPON } from '../core/config.js';
import { mergeParts, boxGeo } from '../world/build.js';
import { LAYER_VIEW } from '../render/render.js';
import { clamp, lerp, damp, smoothstep } from '../core/util.js';
import { mkCanvas } from '../mats/tex.js';

// 주무장 K2C3(가상의 2030년형 카빈): 1인칭 모델, 사격·탄도·반동·재장전·근접 타격.
// 모델은 상자·원통으로 조립해 한 메시로 합치고, 자세는 전부 수식으로 움직인다.

const SIGHT_Y = 0.093;          // 총열 축에서 조준경 광축까지 높이
const HIP = { p: [0.148, -0.152, -0.345], r: [0.004, 0.052, 0] };
const AIM = { p: [0, -SIGHT_Y, -0.2], r: [0, 0, 0] };
const RUN = { p: [0.10, -0.2, -0.3], r: [-0.2, 0.74, 0.2] };

function buildModel(G) {
  const matte = [], steel = [], mag = [], sleeveR = [], gloveR = [], sleeveL = [], gloveL = [];
  const E = new THREE.Euler();
  const bx = (list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => {
    list.push({ geo: boxGeo(w, h, d, 0.4), color, matrix: new THREE.Matrix4().makeRotationFromEuler(E.set(rx, ry, rz)).setPosition(x, y, z) });
  };
  const cy = (list, r, len, x, y, z, color, seg = 10, r2) => {
    const g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg);
    g.rotateX(Math.PI / 2); g.translate(x, y, z);
    list.push({ geo: g, color });
  };
  const cap = (list, r, a, b, color) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from), len = dir.length();
    const g = new THREE.CapsuleGeometry(r, len, 4, 10);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    list.push({ geo: g, color, matrix: new THREE.Matrix4().compose(from.add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)) });
  };
  const RCV = 0x565a61, HG = 0x484b51, POLY = 0x3a3c40, RAIL = 0x33353a, OPT = 0x2a2c30;

  // 총몸
  bx(matte, 0.044, 0.046, 0.25, 0, 0.012, -0.015, RCV);
  bx(matte, 0.04, 0.04, 0.2, 0, -0.03, 0.0, RCV);
  bx(matte, 0.038, 0.055, 0.07, 0, -0.068, -0.058, RCV);
  bx(matte, 0.008, 0.005, 0.075, 0, -0.088, 0.008, POLY);
  bx(matte, 0.006, 0.022, 0.006, 0, -0.072, 0.012, 0x0e0e0f, -0.3);
  bx(matte, 0.034, 0.1, 0.044, 0, -0.098, 0.062, POLY, -0.32);
  bx(matte, 0.03, 0.01, 0.03, 0, 0.038, 0.098, RAIL);
  // 개머리판
  cy(steel, 0.013, 0.17, 0, 0.012, 0.19, 0x2c2e31);
  bx(matte, 0.036, 0.085, 0.13, 0, -0.012, 0.25, POLY);
  bx(matte, 0.03, 0.02, 0.1, 0, 0.036, 0.24, POLY);
  bx(matte, 0.04, 0.115, 0.022, 0, -0.02, 0.324, 0x101011);
  // 총열 덮개와 레일
  bx(matte, 0.048, 0.05, 0.26, 0, 0.008, -0.27, HG);
  bx(matte, 0.03, 0.012, 0.22, 0, -0.022, -0.27, HG);
  for (const z of [-0.2, -0.26, -0.32, -0.37]) bx(matte, 0.0492, 0.013, 0.034, 0, 0.012, z, 0x0c0d0e);
  bx(matte, 0.02, 0.008, 0.5, 0, 0.039, -0.15, RAIL);
  for (let k = 0; k < 24; k++) bx(matte, 0.021, 0.004, 0.0055, 0, 0.045, -0.392 + k * 0.021, RAIL);
  bx(matte, 0.03, 0.035, 0.07, 0, -0.048, -0.3, POLY, 0.26);
  bx(matte, 0.012, 0.012, 0.03, 0, 0.05, -0.375, OPT);
  cy(matte, 0.0125, 0.06, -0.035, 0.008, -0.335, OPT, 8);
  // 총열
  bx(steel, 0.03, 0.035, 0.03, 0, 0.012, -0.415, 0x2c2e31);
  cy(steel, 0.0085, 0.13, 0, 0.008, -0.455, 0x34363a);
  cy(steel, 0.0118, 0.052, 0, 0.008, -0.546, 0x26282b, 10, 0.0105);
  bx(steel, 0.002, 0.018, 0.05, 0.0228, 0.014, -0.03, 0x4c4f54);
  // 반사식 조준경
  bx(matte, 0.03, 0.016, 0.05, 0, 0.051, -0.03, OPT);
  bx(matte, 0.048, 0.007, 0.03, 0, 0.0635, -0.036, OPT);
  for (const sx of [-1, 1]) bx(matte, 0.003, 0.05, 0.026, sx * 0.0225, 0.092, -0.036, OPT);
  bx(matte, 0.048, 0.003, 0.026, 0, 0.1185, -0.036, OPT);
  // 탄창(따로 움직인다)
  bx(mag, 0.027, 0.15, 0.056, 0, -0.165, -0.058, 0x3c3f44, 0.1);
  bx(mag, 0.027, 0.07, 0.054, 0, -0.245, -0.074, 0x3c3f44, 0.28);
  bx(mag, 0.03, 0.008, 0.06, 0, -0.281, -0.086, 0x26282b, 0.28);

  // 오른손: 권총손잡이
  const GLOVE = 0x4a4f40, SKIN = 0x4a4f40;
  bx(gloveR, 0.062, 0.088, 0.062, 0.004, -0.1, 0.07, GLOVE, -0.32);
  bx(gloveR, 0.052, 0.062, 0.03, 0.0, -0.096, 0.036, GLOVE, -0.32);
  bx(gloveR, 0.014, 0.016, 0.06, 0.025, -0.062, 0.02, SKIN);
  bx(gloveR, 0.016, 0.02, 0.055, -0.024, -0.05, 0.072, GLOVE);
  cap(sleeveR, 0.042, [0.03, -0.15, 0.115], [0.15, -0.34, 0.46], 0xffffff);
  // 왼손: 총열 덮개 아래
  bx(gloveL, 0.07, 0.036, 0.1, 0.0, -0.036, -0.26, GLOVE);
  bx(gloveL, 0.014, 0.05, 0.085, 0.031, -0.006, -0.26, GLOVE);
  bx(gloveL, 0.016, 0.046, 0.05, -0.031, -0.006, -0.24, GLOVE);
  cap(sleeveL, 0.04, [-0.02, -0.07, -0.2], [-0.22, -0.34, 0.14], 0xffffff);

  // 총기 전용 재질: 어두운 밤에도 윤곽이 읽히도록 반사를 살리고 아주 약하게 밝힌다.
  const mats = G.mats;
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, envMapIntensity: 1.5, emissive: 0x0b0c0e });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.9, envMapIntensity: 1.8, emissive: 0x08090a });
  const cloth = mats.get('camo').clone(); cloth.emissive = new THREE.Color(0x0b0c0a);
  const glove = mats.get('matte').clone(); glove.emissive = new THREE.Color(0x090a08);
  const mesh = (parts, mat) => {
    const m = new THREE.Mesh(mergeParts(parts), mat);
    m.layers.set(LAYER_VIEW); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
    return m;
  };
  const gun = new THREE.Group();
  const magMesh = mesh(mag, body);
  const armR = new THREE.Group(), armL = new THREE.Group();
  armR.add(mesh(sleeveR, cloth), mesh(gloveR, glove));
  armL.add(mesh(sleeveL, cloth), mesh(gloveL, glove));
  gun.add(mesh(matte, body), mesh(steel, metal), magMesh, armR, armL);

  // 조준경 렌즈와 붉은 점
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.05), new THREE.MeshBasicMaterial({ color: 0x4a7f9a, transparent: true, opacity: 0.08, depthWrite: false }));
  lens.position.set(0, SIGHT_Y, -0.046);
  const dotTex = (() => {
    const c = mkCanvas(64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,80,60,1)'); gr.addColorStop(0.45, 'rgba(255,40,30,0.25)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.0085, 0.0085), new THREE.MeshBasicMaterial({ map: dotTex, color: new THREE.Color().setRGB(2.6, 1.0, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  dot.position.set(0, SIGHT_Y, -0.0465);
  for (const m of [lens, dot]) { m.layers.set(LAYER_VIEW); m.frustumCulled = false; m.renderOrder = 20; gun.add(m); }

  // 총구 화염
  const flashTex = (() => {
    const c = mkCanvas(128), g = c.getContext('2d');
    g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.55, 'rgba(255,140,40,0.3)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3 + Math.random() * 0.3);
      const lg = g.createLinearGradient(0, 0, 62, 0);
      lg.addColorStop(0, 'rgba(255,240,200,0.9)'); lg.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(0, -5); g.lineTo(62, 0); g.lineTo(0, 5); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const flashMat = new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color().setRGB(3.2, 2.2, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flash = new THREE.Group();
  flash.position.set(0, 0.008, -0.6);
  const f0 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), flashMat);
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), flashMat); f1.rotation.y = Math.PI / 2; f1.position.z = -0.06;
  const f2 = f1.clone(); f2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  for (const m of [f0, f1, f2]) { m.layers.set(LAYER_VIEW); m.frustumCulled = false; m.renderOrder = 22; flash.add(m); }
  flash.visible = false;
  gun.add(flash);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.008, -0.585);
  const ejector = new THREE.Object3D(); ejector.position.set(0.03, 0.02, -0.03);
  gun.add(muzzle, ejector);
  return { gun, magMesh, armL, armR, flash, muzzle, ejector, dot };
}

export function createWeapon(G) {
  const ev = G.events, cam = G.camera, player = G.player;
  const M = buildModel(G);
  const root = new THREE.Group();
  root.name = 'viewmodel';
  root.add(M.gun);
  G.viewCamera.add(root);
  // 총기만 비추는 약한 보조광(총기 레이어 전용)
  const fill = new THREE.PointLight(new THREE.Color().setRGB(0.62, 0.74, 1.0), 0.3, 2.6, 2);
  fill.position.set(0.32, 0.42, 0.22);
  fill.layers.set(LAYER_VIEW);
  G.viewCamera.add(fill);

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), dir = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), end = new THREE.Vector3();
  let cooldown = 0, flashT = 0, kickZ = 0, kickRx = 0, kickRz = 0, lagYaw = 0, lagPitch = 0, bloom = 0, sprintT = 0, drop = 0;
  let reloadT = -1, reloadMarks = 0, meleeT = -1, meleeHit = false, emptyT = 0, shotCount = 0, landK = 0;

  const w = {
    name: WEAPON.name, ammo: WEAPON.mag, magSize: WEAPON.mag, reserve: WEAPON.reserve,
    state: 'idle',            // idle | reloading | melee
    ads: 0, spread: WEAPON.hipSpread, root, model: M, shots: 0,

    reset() {
      w.ammo = WEAPON.mag; w.reserve = WEAPON.reserve; w.state = 'idle'; w.ads = 0;
      cooldown = 0; reloadT = -1; meleeT = -1; bloom = 0; kickZ = kickRx = kickRz = 0; flashT = 0; drop = 1;
      M.flash.visible = false;
    },
    setVisible(v) { G.render.state.viewVisible = v; },

    startReload() {
      if (w.state !== 'idle' || w.ammo >= w.magSize || w.reserve <= 0) return;
      w.state = 'reloading'; reloadT = 0; reloadMarks = 0;
    },

    fire() {
      w.ammo--; w.shots++; shotCount++;
      cooldown = 60 / WEAPON.rpm;
      cam.getWorldDirection(fwd);
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      const a = Math.random() * Math.PI * 2, r = w.spread * Math.sqrt(Math.random());
      dir.copy(fwd).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const eye = cam.position;
      const wHit = G.physics.raycast(eye, dir, WEAPON.range);
      const eHit = G.enemies.raycast ? G.enemies.raycast(eye, dir, wHit ? wHit.dist : WEAPON.range) : null;
      if (eHit) {
        end.copy(eHit.point);
        const weak = eHit.part === 'weak';
        const killed = eHit.enemy.damage(WEAPON.damage * (weak ? WEAPON.weakMul : 1), { point: eHit.point, dir, from: eye });
        tmp.copy(dir).negate();
        G.fx.impact(eHit.point, tmp, 'enemy');
        ev.emit('player/scored', { enemy: eHit.enemy, kill: killed, weak });
      } else if (wHit) {
        end.copy(wHit.point);
        G.fx.impact(wHit.point, wHit.normal, wHit.surface);
      } else {
        end.copy(eye).addScaledVector(dir, WEAPON.range);
      }

      // 예광탄·총구 화염·탄피는 총기 모델 위치에서 나온다
      M.muzzle.getWorldPosition(tmp);
      G.render.viewToWorld(tmp, 1.3, tmp2);
      G.fx.tracer(tmp2, end, { color: 0xffa860, gain: shotCount % 3 === 0 ? 2.6 : 1.3, width: 0.045 });
      M.ejector.getWorldPosition(tmp);
      G.render.viewToWorld(tmp, 0.75, tmp2);
      tmp.copy(right).multiplyScalar(2.0 + Math.random() * 0.9).addScaledVector(up, 1.4 + Math.random() * 0.8).addScaledVector(fwd, -0.4 + Math.random() * 0.5).add(player.vel);
      G.fx.shell(tmp2, tmp);
      tmp.copy(eye).addScaledVector(fwd, 0.9).addScaledVector(right, 0.14).addScaledVector(up, -0.1);
      G.render.flash(tmp, 0xffb468, 30, 10, 0.055);
      flashT = 0.05;
      M.flash.visible = true;
      M.flash.rotation.z = Math.random() * Math.PI * 2;
      M.flash.scale.setScalar(0.7 + Math.random() * 0.7);

      // 반동
      const adsK = lerp(1, WEAPON.adsRecoilMul, w.ads) * (player.crouching ? 0.85 : 1);
      player.addRecoil(WEAPON.recoilPitch * adsK * (0.85 + Math.random() * 0.3), (Math.random() - 0.5) * 2 * WEAPON.recoilYaw * adsK);
      kickZ += lerp(0.024, 0.012, w.ads); kickRx += lerp(0.034, 0.012, w.ads); kickRz += (Math.random() - 0.5) * 0.03;
      bloom = Math.min(WEAPON.bloomMax, bloom + WEAPON.bloom * lerp(1, 0.35, w.ads));
      ev.emit('weapon/shot', { ammo: w.ammo });
      if (G.enemies.alertNoise) G.enemies.alertNoise(player.pos, 55);
    },

    melee() {
      if (w.state !== 'idle') return;
      w.state = 'melee'; meleeT = 0; meleeHit = false;
      ev.emit('weapon/melee', {});
    },

    update(dt) {
      const inp = G.input, alive = player.alive && player.enabled;
      cooldown -= dt;

      // 조준
      const wantAds = alive && inp.ads && w.state !== 'reloading' && w.state !== 'melee' && !player.sprinting;
      w.ads = clamp(w.ads + (wantAds ? 1 : -1) * dt / WEAPON.adsTime, 0, 1);
      const adsE = smoothstep(0, 1, w.ads);
      player.ads = adsE; player.adsFov = WEAPON.adsFov;
      sprintT = damp(sprintT, player.sprinting && w.state === 'idle' ? 1 : 0, 9, dt);

      // 탄퍼짐
      const speedK = clamp(player.speed / 6.5, 0, 1);
      bloom = Math.max(0, bloom - dt * 0.09);
      w.spread = lerp(WEAPON.hipSpread + WEAPON.moveSpread * speedK + (player.onGround ? 0 : 0.03), WEAPON.adsSpread + speedK * 0.004, adsE) * (player.crouching ? 0.75 : 1) + bloom;

      // 사격·재장전·근접
      if (alive) {
        if (inp.reloadPressed) w.startReload();
        if (inp.meleePressed) w.melee();
        if (inp.fire && w.state === 'idle' && cooldown <= 0 && sprintT < 0.35) {
          if (w.ammo > 0) w.fire();
          else if (inp.firePressed) { ev.emit('weapon/empty', {}); w.startReload(); }
        }
        if (w.ammo === 0 && w.state === 'idle' && w.reserve > 0) { emptyT += dt; if (emptyT > 0.4) w.startReload(); } else emptyT = 0;
      }

      // 재장전 진행
      let rl = { tilt: 0, magY: 0, magVis: true, hand: 0, bolt: 0, jolt: 0 };
      if (w.state === 'reloading') {
        reloadT += dt;
        const u = reloadT / WEAPON.reloadTime;
        const marks = [[0.16, 'magout'], [0.55, 'magin'], [0.73, 'bolt']];
        while (reloadMarks < marks.length && u >= marks[reloadMarks][0]) {
          const phase = marks[reloadMarks][1];
          ev.emit('weapon/reload', { phase });
          if (phase === 'magin') { const need = w.magSize - w.ammo, take = Math.min(need, w.reserve); w.ammo += take; w.reserve -= take; }
          reloadMarks++;
        }
        rl.tilt = smoothstep(0, 0.1, u) * (1 - smoothstep(0.84, 1, u));
        if (u < 0.3) rl.magY = -0.24 * smoothstep(0.14, 0.3, u);
        else if (u < 0.42) { rl.magY = -0.3; rl.magVis = false; }
        else rl.magY = -0.26 * (1 - smoothstep(0.42, 0.55, u));
        rl.hand = u < 0.58 ? smoothstep(0.08, 0.2, u) : 1 - smoothstep(0.58, 0.66, u);
        rl.bolt = smoothstep(0.62, 0.7, u) * (1 - smoothstep(0.76, 0.88, u));
        rl.jolt = Math.exp(-Math.pow((u - 0.56) * 34, 2)) * 0.5 + Math.exp(-Math.pow((u - 0.74) * 34, 2));
        if (u >= 1) { w.state = 'idle'; reloadT = -1; }
      }

      // 근접 타격
      let ml = 0;
      if (w.state === 'melee') {
        meleeT += dt;
        const u = meleeT / 0.42;
        ml = Math.sin(Math.min(1, u) * Math.PI);
        if (!meleeHit && u > 0.3) {
          meleeHit = true;
          cam.getWorldDirection(fwd);
          const hit = G.enemies.meleeHit ? G.enemies.meleeHit(cam.position, fwd, 2.4) : null;
          if (hit) { const killed = hit.enemy.damage(160, { point: hit.point, dir: fwd, from: cam.position }); G.fx.impact(hit.point, tmp.copy(fwd).negate(), 'enemy'); ev.emit('player/scored', { enemy: hit.enemy, kill: killed, weak: false }); player.addShake(0.3); }
        }
        if (u >= 1) { w.state = 'idle'; meleeT = -1; }
      }

      // ---- 자세 합성 ----
      kickZ = damp(kickZ, 0, 20, dt); kickRx = damp(kickRx, 0, 17, dt); kickRz = damp(kickRz, 0, 14, dt);
      const rate = 1 / Math.max(dt, 1e-3);
      lagYaw = damp(lagYaw, clamp(inp.look.dx * rate * 0.011, -0.07, 0.07), 9, dt);
      lagPitch = damp(lagPitch, clamp(inp.look.dy * rate * 0.011, -0.06, 0.06), 9, dt);
      drop = damp(drop, alive ? 0 : 1, 6, dt);
      landK = damp(landK, player.landDip * 2.2 + clamp(-player.vel.y * 0.006, -0.03, 0.04) * (player.onGround ? 0 : 1), 12, dt);

      const k = adsE * (1 - sprintT), s = sprintT;
      const px = lerp(lerp(HIP.p[0], AIM.p[0], k), RUN.p[0], s), py = lerp(lerp(HIP.p[1], AIM.p[1], k), RUN.p[1], s), pz = lerp(lerp(HIP.p[2], AIM.p[2], k), RUN.p[2], s);
      const rx = lerp(lerp(HIP.r[0], AIM.r[0], k), RUN.r[0], s), ry = lerp(lerp(HIP.r[1], AIM.r[1], k), RUN.r[1], s), rz = lerp(lerp(HIP.r[2], AIM.r[2], k), RUN.r[2], s);
      const bobK = lerp(1, 0.12, adsE), ph = player.bobPhase, mv = clamp(player.speed / 4.3, 0, 1.4) * (player.onGround ? 1 : 0.2);
      const idle = G.time.t;
      root.position.set(
        px + Math.cos(ph) * 0.0045 * mv * bobK + lagYaw * 0.22 * bobK + Math.sin(idle * 1.1) * 0.0012 * bobK,
        py + Math.sin(ph * 2) * 0.004 * mv * bobK - lagPitch * 0.16 * bobK - landK - drop * 0.35 + Math.sin(idle * 1.7) * 0.0014 * bobK - rl.tilt * 0.03 - rl.jolt * 0.006,
        pz + kickZ - ml * 0.2 + rl.jolt * 0.008,
      );
      root.rotation.set(
        rx + kickRx + lagPitch * 0.5 * bobK + rl.tilt * 0.26 - rl.jolt * 0.03 - drop * 0.9 - ml * 0.25,
        ry + lagYaw * 0.8 * bobK + rl.tilt * 0.16 + ml * 0.5,
        rz + kickRz - lagYaw * 0.9 * bobK - rl.tilt * 0.46 + Math.cos(ph) * 0.012 * mv * bobK + ml * 0.4,
      );
      M.magMesh.position.y = rl.magY; M.magMesh.visible = rl.magVis;
      M.armL.position.set(rl.bolt * 0.03, rl.hand * (rl.magY - 0.05) + rl.bolt * 0.07, rl.hand * 0.19 + rl.bolt * 0.28);
      M.armL.rotation.set(rl.bolt * 0.5, 0, 0);
      M.dot.visible = adsE > 0.5 || true;

      if (flashT > 0) { flashT -= dt; if (flashT <= 0) M.flash.visible = false; }
    },
  };
  return w;
}

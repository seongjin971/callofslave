import * as THREE from 'three';
import { mergeParts, boxGeo } from '../world/build.js';
import { clamp, lerp, damp, angleDelta } from '../core/util.js';

// 적 무인 전투체계 두 종류.
//  - 까마귀: 사격형 쿼드콥터. 플레이어 주위를 돌며 점사한다.
//  - 승냥이: 기관총을 얹은 4족 보행 로봇. 길을 찾아 접근해 사격 위치를 잡는다.
// 상태: patrol(순찰) → alert(발견) → engage(교전) → search(수색) → patrol.
// 동시에 사격할 수 있는 수는 '공격 토큰'으로 제한해 화력이 한꺼번에 몰리지 않게 한다.

const CFG = {
  drone: { name: '까마귀', hp: 60, speed: 7.2, radius: 0.46, view: 36, fov: 2.1, burst: 4, interval: 0.115, damage: 6, cool: [1.3, 2.3], range: 32, prefer: [9, 15], alt: [3.6, 6.0], acc: 0.6, telegraph: 0.42 },
  jackal: { name: '승냥이', hp: 170, speed: 3.5, radius: 0.46, view: 32, fov: 1.45, burst: 5, interval: 0.1, damage: 8, cool: [1.5, 2.6], range: 30, prefer: [8, 14], acc: 0.62, telegraph: 0.5 },
};
const TOK = { max: 2, crowd: 3, gap: 0.5 };
const L1 = 0.3, L2 = 0.32, HIP_Y = 0.56;      // 승냥이 다리 길이와 엉덩이 높이
const HIPS = [[-0.21, -0.36], [0.21, -0.36], [-0.21, 0.36], [0.21, 0.36]];

function buildAssets(G) {
  const E = new THREE.Euler();
  const bx = (list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => list.push({ geo: boxGeo(w, h, d, 0.6), color, matrix: new THREE.Matrix4().makeRotationFromEuler(E.set(rx, ry, rz)).setPosition(x, y, z) });
  const cy = (list, r, len, x, y, z, color, axis = 'y', seg = 10) => {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y, z); list.push({ geo: g, color });
  };

  // ---- 까마귀 ----
  const d = [], rot = [], led = [];
  bx(d, 0.34, 0.09, 0.34, 0, 0, 0, 0x2b2e32);
  bx(d, 0.2, 0.06, 0.24, 0, 0.07, 0, 0x383c41);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, sx = Math.sin(a), sz = Math.cos(a);
    bx(d, 0.05, 0.035, 0.48, sx * 0.3, 0.0, sz * 0.3, 0x1b1d20, 0, a, 0);
    cy(d, 0.045, 0.075, sx * 0.52, 0.03, sz * 0.52, 0x101113);
    const disc = new THREE.CircleGeometry(0.215, 18); disc.rotateX(-Math.PI / 2); disc.translate(sx * 0.52, 0.075, sz * 0.52);
    rot.push({ geo: disc, color: 0xffffff });
  }
  bx(d, 0.09, 0.09, 0.27, 0, -0.1, -0.05, 0x23262a);
  cy(d, 0.014, 0.2, 0, -0.11, -0.28, 0x3a3d42, 'z', 8);
  bx(d, 0.13, 0.085, 0.09, 0, -0.03, -0.2, 0x15171a);
  for (const sx of [-1, 1]) { bx(d, 0.018, 0.018, 0.4, sx * 0.16, -0.18, 0, 0x1b1d20); bx(d, 0.018, 0.12, 0.018, sx * 0.16, -0.12, 0.12, 0x1b1d20); bx(d, 0.018, 0.12, 0.018, sx * 0.16, -0.12, -0.12, 0x1b1d20); }
  bx(led, 0.03, 0.02, 0.03, -0.37, 0.02, 0.37, 0xff2010); bx(led, 0.03, 0.02, 0.03, 0.37, 0.02, 0.37, 0x20ff40);

  // ---- 승냥이 ----
  const jb = [], head = [], turret = [], up = [], low = [];
  bx(jb, 0.36, 0.24, 0.92, 0, 0, 0, 0x2c2f29);
  bx(jb, 0.3, 0.04, 0.72, 0, 0.14, 0, 0x3b3f35);
  bx(jb, 0.4, 0.14, 0.3, 0, -0.01, 0.2, 0x23261f);
  for (const sx of [-1, 1]) { bx(jb, 0.02, 0.18, 0.5, sx * 0.19, 0.0, -0.05, 0x40443a); for (const hz of [-0.36, 0.36]) cy(jb, 0.075, 0.09, sx * 0.21, -0.02, hz, 0x1c1e1a, 'x', 10); }
  cy(jb, 0.09, 0.05, 0, 0.165, 0.08, 0x1c1e1a);
  bx(head, 0.24, 0.16, 0.2, 0, 0.02, -0.56, 0x25282b);
  bx(head, 0.2, 0.06, 0.06, 0, 0.11, -0.52, 0x1a1c1e);
  bx(turret, 0.09, 0.085, 0.3, 0, 0.07, 0.0, 0x202326);
  cy(turret, 0.016, 0.3, 0, 0.07, -0.29, 0x3a3d42, 'z', 8);
  bx(turret, 0.1, 0.1, 0.14, 0.105, 0.05, 0.06, 0x343829);
  bx(turret, 0.04, 0.05, 0.05, 0, 0.13, 0.08, 0x101112);
  bx(up, 0.07, L1, 0.09, 0, -L1 / 2, 0, 0x30332c);
  bx(low, 0.05, L2, 0.06, 0, -L2 / 2, 0, 0x1e201c);
  bx(low, 0.075, 0.04, 0.1, 0, -L2 + 0.02, 0, 0x101010);

  const visor = boxGeo(0.2, 0.04, 0.012, 1); visor.translate(0, 0.035, -0.667);
  return {
    drone: mergeParts(d), rotors: mergeParts(rot), leds: mergeParts(led),
    eye: new THREE.SphereGeometry(0.05, 10, 8),
    jbody: mergeParts(jb), jhead: mergeParts(head), jturret: mergeParts(turret), legUp: mergeParts(up), legLow: mergeParts(low), visor,
    rotorMat: new THREE.MeshBasicMaterial({ color: 0x08090a, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    ledMat: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}

export function createEnemies(G) {
  const phys = G.physics, ev = G.events, mats = G.mats;
  const A = buildAssets(G);
  const root = new THREE.Group();
  root.name = 'enemies';
  G.scene.add(root);
  const list = [];
  const tok = { n: 0, lastT: -9 };
  const rnd = (a, b) => a + (b - a) * Math.random();
  const _eye = new THREE.Vector3(), _tgt = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Vector3(), _dir = new THREE.Vector3(), _muz = new THREE.Vector3();
  let time = 0, nextId = 1, stepT = 0;

  const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; };

  function makeDrone(e) {
    const g = new THREE.Group();
    e.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    e.eyeMesh = mesh(A.eye, e.eyeMat, false);
    e.eyeMesh.position.set(0, -0.03, -0.25);
    e.leds = mesh(A.leds, A.ledMat, false);
    g.add(mesh(A.drone, mats.get('matte')), mesh(A.rotors, A.rotorMat, false), e.eyeMesh, e.leds);
    e.spheres = [{ off: new THREE.Vector3(0, -0.03, 0), r: 0.44, part: 'body' }];
    return g;
  }

  function makeJackal(e) {
    const g = new THREE.Group();
    e.bodyG = new THREE.Group();
    e.bodyG.position.y = HIP_Y + 0.02;
    e.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    e.headG = new THREE.Group();
    e.headG.add(mesh(A.jhead, mats.get('matte')), mesh(A.visor, e.eyeMat, false));
    e.turretG = new THREE.Group();
    e.turretG.position.set(0, 0.19, 0.08);
    e.turretG.add(mesh(A.jturret, mats.get('matte')));
    e.bodyG.add(mesh(A.jbody, mats.get('matte')), e.headG, e.turretG);
    e.legs = HIPS.map(([hx, hz]) => {
      const upper = mesh(A.legUp, mats.get('matte')), lower = mesh(A.legLow, mats.get('matte'));
      upper.position.set(hx * 1.12, -0.02, hz);
      lower.position.set(0, -L1, 0);
      upper.add(lower);
      e.bodyG.add(upper);
      return { upper, lower, hz };
    });
    g.add(e.bodyG);
    e.spheres = [
      { off: new THREE.Vector3(0, 0.58, 0), r: 0.36, part: 'body' },
      { off: new THREE.Vector3(0, 0.58, -0.34), r: 0.3, part: 'body' },
      { off: new THREE.Vector3(0, 0.58, 0.34), r: 0.3, part: 'body' },
      { off: new THREE.Vector3(0, 0.84, 0.05), r: 0.2, part: 'body' },
      { off: new THREE.Vector3(0, 0.62, -0.6), r: 0.2, part: 'weak' },
    ];
    e.body = { pos: e.pos, vel: e.vel, radius: 0.42, height: 0.95, step: 0.36, airStep: 0.2, onGround: true };
    return g;
  }

  function spawn(type, pos, o = {}) {
    const cfg = CFG[type];
    const e = {
      id: nextId++, type, cfg, name: cfg.name,
      pos: new THREE.Vector3(pos[0], pos[1], pos[2]), vel: new THREE.Vector3(), yaw: o.yaw ?? rnd(0, 6.28),
      hp: cfg.hp, alive: true, state: 'patrol', stateT: 0,
      patrol: (o.patrol || [pos]).map((p) => new THREE.Vector3(p[0], p[1], p[2])), patrolI: 0, zone: o.zone || '',
      target: new THREE.Vector3(pos[0], pos[1], pos[2]), path: null, pathI: 0, repathT: 0, retargetT: 0, strafeT: 1,
      lastKnown: new THREE.Vector3(), sees: false, dist: 999, senseT: Math.random() * 0.15, lostT: 0, suspicion: 0,
      burstLeft: 0, fireT: 0, cool: rnd(0.4, 1.2), tele: 0, hasToken: false, firstBurst: true,
      hitFlash: 0, stun: 0, gait: Math.random() * 6, stuckT: 0, deadT: 0, bob: Math.random() * 6, tiltX: 0, tiltZ: 0, aimYaw: 0, aimPitch: 0,
      damage(amount, info) { return damage(e, amount, info); },
    };
    e.group = type === 'drone' ? makeDrone(e) : makeJackal(e);
    e.group.position.copy(e.pos); e.group.rotation.y = e.yaw;
    root.add(e.group);
    if (type === 'drone' && G.audio.loop) e.loop = G.audio.loop('drone', { pos: e.pos, gain: 0.5, ref: 4, rolloff: 1.5 });
    if (o.engage) { e.lastKnown.copy(G.player.pos); setState(e, 'search'); }
    list.push(e);
    return e;
  }

  function setState(e, s) {
    if (e.state === s) return;
    if (e.state === 'engage' && s !== 'engage') { releaseToken(e); e.burstLeft = 0; e.tele = 0; }
    e.state = s; e.stateT = 0;
    if (s === 'engage') { e.retargetT = 0; e.repathT = 0; e.lostT = 0; }
    if (s === 'alert') ev.emit('enemy/spotted', { pos: e.pos, enemy: e });
  }
  function requestToken(e) {
    if (e.hasToken) return true;
    let alive = 0;
    for (const o of list) if (o.alive) alive++;
    if (tok.n >= (alive > 5 ? TOK.crowd : TOK.max) || time - tok.lastT < TOK.gap) return false;
    tok.n++; tok.lastT = time; e.hasToken = true;
    return true;
  }
  function releaseToken(e) { if (e.hasToken) { e.hasToken = false; tok.n = Math.max(0, tok.n - 1); } }
  function alertAllies(e, radius = 26) {
    for (const o of list) {
      if (o === e || !o.alive || (o.state !== 'patrol' && o.state !== 'search')) continue;
      if (o.pos.distanceTo(e.pos) < radius) { o.lastKnown.copy(e.lastKnown); setState(o, 'alert'); }
    }
  }

  const eyePos = (e, out) => (e.type === 'drone' ? out.copy(e.pos) : out.set(e.pos.x - Math.sin(e.yaw) * 0.5, e.pos.y + 0.85, e.pos.z - Math.cos(e.yaw) * 0.5));

  function perceive(e) {
    const P = G.player;
    e.sees = false;
    if (!P.alive || !P.enabled) return;
    eyePos(e, _eye);
    _tgt.copy(P.eye); _tgt.y -= 0.32;
    e.dist = _eye.distanceTo(_tgt);
    if (e.dist > e.cfg.view) return;
    const want = Math.atan2(-(_tgt.x - _eye.x), -(_tgt.z - _eye.z));
    if (e.dist > 5 && Math.abs(angleDelta(e.yaw, want)) > e.cfg.fov && e.state === 'patrol') return;
    e.sees = phys.lineOfSight(_eye, _tgt) || phys.lineOfSight(_eye, P.eye);
  }

  function muzzlePos(e, out) {
    if (e.type === 'drone') return out.set(e.pos.x - Math.sin(e.yaw) * 0.38, e.pos.y - 0.12, e.pos.z - Math.cos(e.yaw) * 0.38);
    const y = e.aimYaw;
    return out.set(e.pos.x - Math.sin(y) * 0.5 + Math.sin(e.yaw) * -0.08, e.pos.y + HIP_Y + 0.3, e.pos.z - Math.cos(y) * 0.5 + Math.cos(e.yaw) * -0.08);
  }

  function fireShot(e) {
    const P = G.player, cfg = e.cfg;
    muzzlePos(e, _muz);
    _tgt.copy(P.eye); _tgt.y -= 0.35;
    const dist = _muz.distanceTo(_tgt);
    let acc = cfg.acc * clamp(1.3 - dist / cfg.range, 0.25, 1) * (P.speed > 4.6 ? 0.6 : P.speed > 1.2 ? 0.84 : 1) * (P.crouching ? 0.8 : 1) * (e.firstBurst ? 0.45 : 1) * api.difficulty;
    if (!P.alive || !phys.lineOfSight(_muz, _tgt)) acc = 0;
    if (Math.random() < acc) {
      _c.copy(_tgt).add(_v.set(rnd(-0.12, 0.12), rnd(-0.15, 0.15), rnd(-0.12, 0.12)));
      P.damage(cfg.damage, _muz);
    } else {
      // 빗나간 탄: 플레이어 주변을 스치고 뒤쪽 벽에 꽂힌다
      const a = Math.random() * 6.28, r = rnd(0.5, 1.4);
      _v.set(Math.cos(a) * r, Math.sin(a) * r * 0.7 + 0.1, Math.sin(a * 1.7) * r);
      _dir.copy(_tgt).add(_v).sub(_muz).normalize();
      const hit = phys.raycast(_muz, _dir, 90);
      if (hit) { _c.copy(hit.point); G.fx.impact(hit.point, hit.normal, hit.surface, { quiet: hit.dist > 40 }); } else _c.copy(_muz).addScaledVector(_dir, 70);
      if (dist < 40 && Math.random() < 0.7) ev.emit('enemy/nearmiss', { pos: _v2.copy(_tgt).add(_v) });
    }
    G.fx.tracer(_muz, _c, { color: 0x7dffa0, gain: 2.0, speed: 190, len: 8, width: 0.05, lead: 0.4 });
    G.fx.add.spawn(_muz.x, _muz.y, _muz.z, 0, 0, 0, 0.05, 0.5, 0.2, 2.2, 2.6, 1.4, 1);
    if (Math.random() < 0.5) G.render.flash(_muz, 0xa0ffb0, 12, 7, 0.05);
    ev.emit('enemy/shot', { pos: _muz, type: e.type });
  }

  function combat(e, dt) {
    const cfg = e.cfg;
    e.cool -= dt;
    if (e.burstLeft > 0) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        fireShot(e);
        e.burstLeft--; e.fireT = cfg.interval;
        if (e.burstLeft === 0) { e.cool = rnd(cfg.cool[0], cfg.cool[1]) / api.difficulty; releaseToken(e); e.firstBurst = false; }
      }
    } else if (e.tele > 0) {
      e.tele -= dt;
      if (e.tele <= 0) { if (e.sees) { e.burstLeft = cfg.burst; e.fireT = 0; } else { releaseToken(e); e.cool = 0.5; } }
    } else if (e.sees && e.dist < cfg.range && e.cool <= 0 && e.stateT > 0.35 && requestToken(e)) {
      e.tele = cfg.telegraph;
      ev.emit('enemy/aiming', { pos: e.pos, enemy: e });
    }
  }

  function damage(e, amount, info) {
    if (!e.alive) return false;
    e.hp -= amount; e.hitFlash = 0.12;
    if (e.type === 'drone' && info && info.dir) e.vel.addScaledVector(info.dir, 2.6);
    else e.stun = 0.16;
    if (e.state !== 'engage') { e.lastKnown.copy(G.player.pos); setState(e, 'engage'); alertAllies(e); }
    if (e.hp <= 0) { kill(e); return true; }
    return false;
  }

  function kill(e) {
    e.alive = false; e.state = 'dead'; e.deadT = 0;
    releaseToken(e);
    if (e.loop) { e.loop.stop(0.1); e.loop = null; }
    _v.copy(e.pos); if (e.type === 'jackal') _v.y += 0.6;
    ev.emit('enemy/down', { type: e.type, name: e.name, pos: _v.clone(), enemy: e });
    if (e.type === 'drone') {
      G.fx.explosion(_v, { scale: 0.8 });
      root.remove(e.group);
    } else {
      G.fx.explosion(_v, { scale: 0.62 });
      e.eyeMat.color.setRGB(0.02, 0.02, 0.02);
      G.fx.addEmitter('smoke', _v.clone(), { ttl: 9, rate: 5, size: 0.35, temp: true });
      G.fx.addEmitter('sparks', _v.clone(), { ttl: 4, rate: 2.5, temp: true });
    }
  }

  // ---- 이동 ----
  function setPath(e, target) {
    e.path = phys.findPath(e.pos, target);
    e.pathI = 0;
    return !!e.path;
  }
  function moveAlong(e, dt, speed) {
    const b = e.body;
    if (!e.path || e.pathI >= e.path.length || e.stun > 0) { b.vel.x = damp(b.vel.x, 0, 10, dt); b.vel.z = damp(b.vel.z, 0, 10, dt); return true; }
    const wp = e.path[e.pathI], dx = wp.x - e.pos.x, dz = wp.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { e.pathI++; return e.pathI >= e.path.length; }
    const want = Math.atan2(-dx, -dz), dy = angleDelta(e.yaw, want);
    e.yaw += clamp(dy, -4.2 * dt, 4.2 * dt);
    const sp = speed * (0.25 + 0.75 * Math.max(0, Math.cos(dy)));
    b.vel.x = damp(b.vel.x, (dx / d) * sp, 8, dt); b.vel.z = damp(b.vel.z, (dz / d) * sp, 8, dt);
    return false;
  }
  const faceTo = (e, x, z, dt, rate = 3.5) => { const want = Math.atan2(-(x - e.pos.x), -(z - e.pos.z)); e.yaw += clamp(angleDelta(e.yaw, want), -rate * dt, rate * dt); };

  function ceilingAt(x, z, y) {
    let c = 40;
    for (const b of phys.boxes) {
      if (b.bodyOnly || x < b.min.x - 0.5 || x > b.max.x + 0.5 || z < b.min.z - 0.5 || z > b.max.z + 0.5) continue;
      if (b.min.y > y - 0.6 && b.min.y < c) c = b.min.y;
    }
    return c;
  }

  // ---- 까마귀 ----
  function pickOrbit(e) {
    const P = G.player, cfg = e.cfg;
    const cur = Math.atan2(e.pos.z - P.pos.z, e.pos.x - P.pos.x);
    for (let i = 0; i < 8; i++) {
      const a = cur + (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 1.7), r = rnd(cfg.prefer[0], cfg.prefer[1]);
      _v.set(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r);
      _v.y = phys.groundAt(_v.x, _v.z, 2) + rnd(cfg.alt[0], cfg.alt[1]);
      _v.y = Math.min(_v.y, ceilingAt(_v.x, _v.z, _v.y - 2) - 0.9);
      if (phys.pointBlocked(_v.x, _v.y, _v.z, 0.7)) continue;
      if (!phys.lineOfSight(_v, P.eye)) continue;
      if (i < 5 && !phys.lineOfSight(e.pos, _v)) continue;
      e.target.copy(_v);
      e.path = phys.lineOfSight(e.pos, _v) ? null : phys.findPath(e.pos, _v);
      e.pathI = 0;
      return;
    }
    // 마땅한 자리가 없으면 마지막으로 본 곳 위로 접근
    e.target.set(e.lastKnown.x, e.lastKnown.y + 4.5, e.lastKnown.z);
    e.path = phys.lineOfSight(e.pos, e.target) ? null : phys.findPath(e.pos, e.target);
    e.pathI = 0;
  }

  function flyTo(e, dt, speed) {
    let tx = e.target.x, ty = e.target.y, tz = e.target.z;
    if (e.path && e.pathI < e.path.length) {
      const wp = e.path[e.pathI];
      tx = wp.x; tz = wp.z; ty = Math.max(e.pos.y, 3.2);
      if (Math.hypot(tx - e.pos.x, tz - e.pos.z) < 1.0) e.pathI++;
    }
    ty = Math.min(ty, ceilingAt(e.pos.x, e.pos.z, e.pos.y - 1.5) - 0.8);
    _v.set(tx - e.pos.x, ty - e.pos.y, tz - e.pos.z);
    const d = _v.length();
    const sp = Math.min(speed, d * 2.2);
    if (d > 1e-3) _v.multiplyScalar(sp / d);
    const k = 1 - Math.exp(-2.6 * dt);
    const ax = (_v.x - e.vel.x) * k, az = (_v.z - e.vel.z) * k;
    e.vel.x += ax; e.vel.y += (_v.y - e.vel.y) * k; e.vel.z += az;
    e.pos.addScaledVector(e.vel, dt);
    e.pos.y += Math.sin(time * 2.1 + e.bob) * 0.18 * dt;
    if (phys.pushSphere(e.pos, e.cfg.radius)) e.vel.multiplyScalar(0.9);
    // 가속 방향으로 기체를 기울인다
    const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
    const fwdAcc = (-s * ax - c * az) / Math.max(dt, 1e-3), sideAcc = (c * ax - s * az) / Math.max(dt, 1e-3);
    e.tiltX = damp(e.tiltX, clamp(-fwdAcc * 0.035, -0.4, 0.4), 6, dt);
    e.tiltZ = damp(e.tiltZ, clamp(-sideAcc * 0.035, -0.4, 0.4), 6, dt);
    return d < 1.2;
  }

  function updateDrone(e, dt) {
    const P = G.player, cfg = e.cfg;
    switch (e.state) {
      case 'patrol': {
        e.target.copy(e.patrol[e.patrolI]);
        if (flyTo(e, dt, 2.4)) e.patrolI = (e.patrolI + 1) % e.patrol.length;
        if (e.vel.lengthSq() > 0.2) faceTo(e, e.pos.x + e.vel.x, e.pos.z + e.vel.z, dt, 2);
        if (e.sees) { e.suspicion += dt * (1.9 - e.dist / cfg.view) * (P.crouching ? 0.6 : 1); if (e.suspicion > 0.55) { e.lastKnown.copy(P.pos); setState(e, 'alert'); alertAllies(e); } }
        else e.suspicion = Math.max(0, e.suspicion - dt * 0.4);
        break;
      }
      case 'alert': {
        e.vel.multiplyScalar(Math.exp(-3 * dt)); e.pos.addScaledVector(e.vel, dt);
        faceTo(e, e.lastKnown.x, e.lastKnown.z, dt, 5);
        if (e.stateT > 0.55) setState(e, e.sees ? 'engage' : 'search');
        break;
      }
      case 'engage': {
        if (e.sees) { e.lastKnown.copy(P.pos); e.lostT = 0; } else e.lostT += dt;
        e.retargetT -= dt;
        const arrived = flyTo(e, dt, cfg.speed);
        if (e.retargetT <= 0 || (arrived && e.retargetT < 1.2)) { pickOrbit(e); e.retargetT = rnd(1.8, 3.4); }
        faceTo(e, P.pos.x, P.pos.z, dt, 6);
        combat(e, dt);
        if (e.lostT > 3.8) setState(e, 'search');
        break;
      }
      case 'search': {
        e.target.set(e.lastKnown.x, e.lastKnown.y + 4.5, e.lastKnown.z);
        if (e.stateT < 0.1 || (e.path && e.pathI >= e.path.length)) { e.path = phys.lineOfSight(e.pos, e.target) ? null : phys.findPath(e.pos, e.target); e.pathI = 0; }
        const there = flyTo(e, dt, cfg.speed * 0.7);
        if (there) e.yaw += dt * 1.6; else faceTo(e, e.target.x, e.target.z, dt, 3);
        if (e.sees) setState(e, 'engage');
        else if (e.stateT > 11) { e.suspicion = 0; setState(e, 'patrol'); }
        break;
      }
    }
    e.group.position.copy(e.pos);
    e.group.rotation.set(e.tiltX, e.yaw, e.tiltZ, 'YXZ');
    e.leds.visible = Math.sin(time * 6 + e.bob) > 0.2;
    if (e.loop) { e.loop.setPos(e.pos); e.loop.setRate(0.92 + Math.min(0.35, e.vel.length() * 0.035)); }
  }

  // ---- 승냥이 ----
  function strafePoint(e) {
    const P = G.player;
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 6; i++) {
      const side = (Math.random() < 0.5 ? -1 : 1) * rnd(2, 4.5), back = e.dist < e.cfg.prefer[0] ? -rnd(2, 4) : rnd(-1, 1.5);
      _v.set(e.pos.x + (-dz / d) * side + (dx / d) * back, 0, e.pos.z + (dx / d) * side + (dz / d) * back);
      if (!phys.walkable(_v.x, _v.z)) continue;
      _v2.set(_v.x, 0.9, _v.z);
      if (!phys.lineOfSight(_v2, P.eye)) continue;
      return setPath(e, _v);
    }
    return false;
  }

  function animateLegs(e, dt, speed) {
    const moving = speed > 0.25 && e.alive;
    if (moving) e.gait += dt * (4.5 + speed * 3.4);
    const stride = 0.17 * clamp(speed / 3.5, 0, 1), sink = e.alive ? 0 : Math.min(1, e.deadT / 0.5) * 0.3;
    e.bodyG.position.y = HIP_Y + 0.02 - sink + (moving ? Math.abs(Math.sin(e.gait)) * 0.02 : Math.sin(time * 2 + e.bob) * 0.004);
    for (let i = 0; i < 4; i++) {
      const leg = e.legs[i], ph = e.gait + (i === 0 || i === 3 ? 0 : Math.PI);
      const fz = -Math.cos(ph) * stride * (moving ? 1 : 0) + 0.02;                 // 발의 앞뒤 위치(엉덩이 기준)
      const fy = e.bodyG.position.y - 0.02 - (moving ? Math.max(0, Math.sin(ph)) * 0.12 : 0);   // 엉덩이에서 발까지 수직 거리
      const dist = Math.min(L1 + L2 - 0.005, Math.hypot(fy, fz));
      const base = Math.atan2(fz, fy);
      const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
      const p1 = base + a;                                                          // 무릎이 뒤(+Z)로 꺾인다
      const kz = Math.sin(p1) * L1, ky = Math.cos(p1) * L1;
      const p2 = Math.atan2(fz - kz, fy - ky);
      leg.upper.rotation.x = -p1;
      leg.lower.rotation.x = -(p2 - p1);
    }
    if (moving) {
      stepT -= dt;
      const c = Math.cos(e.gait);
      if (e.lastC !== undefined && Math.sign(c) !== Math.sign(e.lastC) && stepT <= 0 && e.dist < 24) { stepT = 0.16; ev.emit('enemy/step', { pos: e.pos }); }
      e.lastC = c;
    }
  }

  function updateJackal(e, dt) {
    const P = G.player, cfg = e.cfg, b = e.body;
    e.stun = Math.max(0, e.stun - dt);
    let aimAtPlayer = false;
    switch (e.state) {
      case 'patrol': {
        if (!e.path || e.pathI >= e.path.length) { e.patrolI = (e.patrolI + 1) % e.patrol.length; setPath(e, e.patrol[e.patrolI]); }
        moveAlong(e, dt, 1.5);
        if (e.sees) { e.suspicion += dt * (1.7 - e.dist / cfg.view) * (P.crouching ? 0.6 : 1); if (e.suspicion > 0.6) { e.lastKnown.copy(P.pos); setState(e, 'alert'); alertAllies(e); } }
        else e.suspicion = Math.max(0, e.suspicion - dt * 0.4);
        break;
      }
      case 'alert': {
        b.vel.x = damp(b.vel.x, 0, 10, dt); b.vel.z = damp(b.vel.z, 0, 10, dt);
        faceTo(e, e.lastKnown.x, e.lastKnown.z, dt, 5);
        if (e.stateT > 0.6) { setState(e, e.sees ? 'engage' : 'search'); e.path = null; }
        break;
      }
      case 'engage': {
        if (e.sees) { e.lastKnown.copy(P.pos); e.lostT = 0; } else e.lostT += dt;
        aimAtPlayer = e.sees;
        const inPosition = e.sees && e.dist < cfg.prefer[1];
        if (inPosition) {
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafeT = rnd(1.6, 3.4); if (!strafePoint(e)) e.path = null; }
          const done = moveAlong(e, dt, cfg.speed * 0.6);
          if (done) faceTo(e, P.pos.x, P.pos.z, dt, 4);
        } else {
          e.repathT -= dt;
          if (e.repathT <= 0 || !e.path) { e.repathT = rnd(0.6, 1.0); setPath(e, e.sees ? P.pos : e.lastKnown); }
          moveAlong(e, dt, cfg.speed);
        }
        combat(e, dt);
        if (e.lostT > 4.2) { setState(e, 'search'); e.path = null; }
        break;
      }
      case 'search': {
        if (!e.path && e.stateT < 0.5) setPath(e, e.lastKnown);
        const there = moveAlong(e, dt, cfg.speed * 0.8);
        if (there) e.yaw += dt * 1.2 * Math.sin(e.stateT * 0.9);
        if (e.sees) setState(e, 'engage');
        else if (e.stateT > 12) { e.suspicion = 0; e.path = null; setState(e, 'patrol'); }
        break;
      }
    }
    b.vel.y -= 15 * dt;
    const px = e.pos.x, pz = e.pos.z;
    phys.moveBody(b, dt);
    const moved = Math.hypot(e.pos.x - px, e.pos.z - pz) / Math.max(dt, 1e-3);
    // 길이 막혀 제자리걸음이면 경로를 다시 잡는다
    if (e.path && e.pathI < e.path.length && moved < 0.3) { e.stuckT += dt; if (e.stuckT > 1.2) { e.stuckT = 0; e.path = null; e.repathT = 0; } } else e.stuckT = 0;

    // 포탑 조준
    let wantYaw = e.yaw, wantPitch = 0;
    if (aimAtPlayer) { _v.copy(P.eye).sub(e.pos); _v.y -= 1.1; wantYaw = Math.atan2(-_v.x, -_v.z); wantPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z)); }
    e.aimYaw += clamp(angleDelta(e.aimYaw, wantYaw), -5 * dt, 5 * dt);
    e.aimPitch = damp(e.aimPitch, wantPitch, 8, dt);
    e.group.position.copy(e.pos);
    e.group.rotation.y = e.yaw;
    e.turretG.rotation.set(e.aimPitch, e.aimYaw - e.yaw, 0, 'YXZ');
    e.headG.rotation.y = clamp(angleDelta(e.yaw, wantYaw), -0.6, 0.6) * 0.6;
    animateLegs(e, dt, moved);
  }

  function updateWreck(e, dt) {
    e.deadT += dt;
    if (e.type !== 'jackal') return;
    e.body.vel.x *= 0.9; e.body.vel.z *= 0.9; e.body.vel.y -= 15 * dt;
    phys.moveBody(e.body, dt);
    e.group.position.copy(e.pos);
    const k = Math.min(1, e.deadT / 0.5);
    e.bodyG.rotation.z = k * 0.28; e.bodyG.rotation.x = k * 0.12;
    animateLegs(e, dt, 0);
  }

  function eyeColor(e) {
    const m = e.eyeMat.color;
    if (e.hitFlash > 0) { m.setRGB(6, 6, 6); return; }
    if (e.tele > 0 || e.burstLeft > 0) { const k = 0.6 + 0.4 * Math.sin(time * 60); m.setRGB(7 * k, 0.6 * k, 0.3 * k); }
    else if (e.state === 'engage') m.setRGB(3.2, 0.22, 0.12);
    else if (e.state === 'alert' || e.state === 'search') { const k = 0.55 + 0.45 * Math.sin(time * 14); m.setRGB(3.4 * k, 1.9 * k, 0.2 * k); }
    else m.setRGB(1.3, 0.75, 0.16);
  }

  const api = {
    list, root, CFG, difficulty: 1,
    spawn,
    aliveCount() { let n = 0; for (const e of list) if (e.alive) n++; return n; },
    engagedCount() { let n = 0; for (const e of list) if (e.alive && (e.state === 'engage' || e.state === 'alert')) n++; return n; },
    clear() {
      for (const e of list) { if (e.loop) e.loop.stop(0.05); root.remove(e.group); }
      list.length = 0; tok.n = 0;
    },
    // 총성·폭발 등 소음: 반경 안의 적이 그 위치를 수색하러 온다
    alertNoise(pos, radius) {
      for (const e of list) {
        if (!e.alive || (e.state !== 'patrol' && e.state !== 'search')) continue;
        if (e.pos.distanceTo(pos) > radius) continue;
        e.lastKnown.copy(pos);
        if (e.state === 'patrol') setState(e, 'alert'); else { e.stateT = 0.6; e.path = null; }
      }
    },
    // 광선과 적의 피격 구 판정. 가장 가까운 것을 돌려준다.
    raycast(o, d, maxDist = 300) {
      let best = null, bestT = maxDist;
      for (const e of list) {
        if (!e.alive) continue;
        const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
        for (const sp of e.spheres) {
          const cx = e.pos.x + sp.off.x * c + sp.off.z * s, cy = e.pos.y + sp.off.y, cz = e.pos.z - sp.off.x * s + sp.off.z * c;
          const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
          const tca = lx * d.x + ly * d.y + lz * d.z;
          if (tca < 0) continue;
          const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
          if (d2 > sp.r * sp.r) continue;
          const t = tca - Math.sqrt(sp.r * sp.r - d2);
          if (t > 0 && (t < bestT - 0.02 || (best && best.enemy === e && sp.part === 'weak' && t < bestT + 0.25))) {
            bestT = Math.min(bestT, t);
            best = { enemy: e, dist: t, part: sp.part, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) };
          }
        }
      }
      return best;
    },
    meleeHit(o, d, range) {
      let best = null, bestD = range;
      for (const e of list) {
        if (!e.alive) continue;
        _v.copy(e.pos); if (e.type === 'jackal') _v.y += 0.6;
        _v2.subVectors(_v, o);
        const dist = _v2.length();
        if (dist < bestD && _v2.normalize().dot(d) > 0.55) { bestD = dist; best = { enemy: e, point: _v.clone() }; }
      }
      return best;
    },
    update(dt) {
      time += dt;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (!e.alive) {
          updateWreck(e, dt);
          if (e.type === 'drone' || e.deadT > 45) { if (e.type !== 'drone') root.remove(e.group); list.splice(i, 1); }
          continue;
        }
        e.stateT += dt;
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.senseT -= dt;
        if (e.senseT <= 0) { e.senseT = 0.1 + Math.random() * 0.05; perceive(e); }
        if (e.type === 'drone') updateDrone(e, dt); else updateJackal(e, dt);
        eyeColor(e);
      }
      // 승냥이끼리 겹치지 않게 살짝 밀어낸다
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive || a.type !== 'jackal') continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (!b.alive || b.type !== 'jackal') continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
          if (d < 1.1 && d > 1e-3) { const k = ((1.1 - d) / d) * 2; a.vel.x -= dx * k; a.vel.z -= dz * k; b.vel.x += dx * k; b.vel.z += dz * k; }
        }
      }
    },
  };
  return api;
}

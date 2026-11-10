import * as THREE from 'three';
import { SKY } from '../render/sky.js';
import { mkCanvas } from '../mats/tex.js';

// 이펙트: 비, 입자(불꽃·연기·먼지), 예광탄, 탄흔, 탄피, 폭발, 지속 방출기(화재·연막).
// 전부 풀에서 재사용하므로 전투 중에 메모리를 새로 잡지 않는다.

const PVERT = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
varying float vFog;
uniform float uFogDensity;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uScale / max(0.05, -mv.z), 1400.0);
  vColor = aColor;
  float d = uFogDensity * length(mv.xyz);
  vFog = 1.0 - exp(-d * d);
}`;
const PFRAG = /* glsl */`
uniform float uSoft;
uniform float uAdd;
uniform vec3 uFogColor;
varying vec4 vColor;
varying float vFog;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoft) * vColor.a;
  vec3 c = mix(vColor.rgb, uFogColor, vFog * (1.0 - uAdd));
  gl_FragColor = vec4(c, a * mix(1.0, 1.0 - vFog, uAdd));
}`;

class Particles {
  constructor(max, additive, soft) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.rgb = new Float32Array(max * 3); this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.fadeIn = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = {
      uScale: { value: 600 }, uSoft: { value: soft }, uAdd: { value: additive ? 1 : 0 },
      uFogDensity: { value: 0.0155 }, uFogColor: { value: SKY.fog.clone() },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: PVERT, fragmentShader: PFRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 10;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, fadeIn = 0) {
    let i = this.n;
    if (i >= this.max) {
      // 가득 차면 수명이 가장 적게 남은 것을 덮어쓴다
      i = 0; let best = Infinity;
      for (let k = 0; k < this.max; k += 7) { const rem = this.maxLife[k] - this.life[k]; if (rem < best) { best = rem; i = k; } }
    } else this.n++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.rgb[i3] = r; this.rgb[i3 + 1] = g; this.rgb[i3 + 2] = b; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        // 마지막 입자를 이 자리로 옮긴다
        const l = this.n - 1;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[l * 3 + k]; this.vel[i * 3 + k] = this.vel[l * 3 + k]; this.rgb[i * 3 + k] = this.rgb[l * 3 + k]; }
          this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l]; this.s0[i] = this.s0[l]; this.s1[i] = this.s1[l];
          this.a0[i] = this.a0[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.fadeIn[i] = this.fadeIn[l];
        }
        this.n--;
        continue;
      }
      const i3 = i * 3, k = this.life[i] / this.maxLife[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.grav[i] > 4 && this.pos[i3 + 1] < 0.02) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.35; this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const fi = this.fadeIn[i] > 0 ? Math.min(1, this.life[i] / this.fadeIn[i]) : 1;
      const i4 = i * 4;
      this.col[i4] = this.rgb[i3]; this.col[i4 + 1] = this.rgb[i3 + 1]; this.col[i4 + 2] = this.rgb[i3 + 2];
      this.col[i4 + 3] = this.a0[i] * (1 - k) * (1 - k * 0.3) * fi;
      i++;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    g.setDrawRange(0, this.n);
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

const RAIN_VERT = /* glsl */`
attribute vec3 aBase;
attribute float aEnd;
attribute float aSpeed;
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uWind;
varying float vAlpha;
void main() {
  vec3 p = aBase;
  p.y -= uTime * aSpeed;
  p.xz += uWind.xz * uTime;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  float len = 0.021 * aSpeed;
  vec3 world = uCam + rel + vec3(-uWind.x, aSpeed, -uWind.z) * (aEnd * len / aSpeed);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = smoothstep(uBox.x * 0.5, uBox.x * 0.32, max(abs(rel.x), abs(rel.z)));
  vAlpha = (1.0 - aEnd * 0.75) * edge * smoothstep(0.3, 1.6, -mv.z);
}`;
const RAIN_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
varying float vAlpha;
void main() { gl_FragColor = vec4(uColor, vAlpha * uAlpha); }`;

export function createFx(G) {
  const scene = G.scene, cam = G.camera, phys = G.physics;
  const group = new THREE.Group();
  group.name = 'fx';
  scene.add(group);
  const rnd = (a, b) => a + (b - a) * Math.random();

  const add = new Particles(900, true, 1.6), alpha = new Particles(520, false, 1.2);
  group.add(alpha.points, add.points);

  // ---- 비 ----
  const rainCount = Math.round(9000 * (G.quality.rain ?? 1));
  let rain = null;
  if (rainCount > 0) {
    const base = new Float32Array(rainCount * 6), end = new Float32Array(rainCount * 2), speed = new Float32Array(rainCount * 2);
    const box = new THREE.Vector3(38, 22, 38);
    for (let i = 0; i < rainCount; i++) {
      const x = Math.random() * box.x, y = Math.random() * box.y, z = Math.random() * box.z, s = rnd(20, 28);
      base.set([x, y, z, x, y, z], i * 6); end.set([0, 1], i * 2); speed.set([s, s], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rainCount * 6), 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    const uniforms = {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: box }, uWind: { value: new THREE.Vector3(2.6, 0, 1.1) },
      uColor: { value: new THREE.Color().setRGB(0.5, 0.58, 0.7) }, uAlpha: { value: 0.2 },
    };
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    rain = new THREE.LineSegments(g, m);
    rain.frustumCulled = false; rain.renderOrder = 8;
    rain.userData.uniforms = uniforms;
    group.add(rain);
  }

  // ---- 예광탄 ----
  const TR_MAX = 48;
  const trTex = (() => {
    const c = mkCanvas(64, 16), g = c.getContext('2d');
    const img = g.createImageData(64, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
      const u = x / 63, v = Math.abs(y / 15 - 0.5) * 2, a = Math.pow(u, 1.6) * Math.pow(1 - v, 2.2);
      const i = (y * 64 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * a; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
  })();
  const trMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: trTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), TR_MAX);
  trMesh.frustumCulled = false; trMesh.renderOrder = 13; trMesh.count = 0;
  trMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trMesh.setColorAt(0, new THREE.Color(1, 1, 1));      // instanceColor 속성을 미리 만들어 둔다
  group.add(trMesh);
  const tracers = [];
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _mid = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color();

  // ---- 탄흔 ----
  const DC_MAX = 140;
  const dcTex = (() => {
    const c = mkCanvas(64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.22, 'rgba(8,8,8,0.95)'); gr.addColorStop(0.5, 'rgba(30,28,26,0.5)'); gr.addColorStop(1, 'rgba(40,38,36,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, r = 10 + Math.random() * 18; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const dcMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dcTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), DC_MAX);
  dcMesh.frustumCulled = false; dcMesh.renderOrder = 4; dcMesh.count = 0;
  group.add(dcMesh);
  let dcNext = 0, dcCount = 0;
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), ZAXIS = new THREE.Vector3(0, 0, 1);

  // ---- 탄피 ----
  const SH_MAX = 40;
  const shMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0055, 0.006, 0.032, 6), new THREE.MeshStandardMaterial({ color: 0xb48a34, metalness: 1, roughness: 0.32 }), SH_MAX);
  shMesh.frustumCulled = false; shMesh.count = SH_MAX; shMesh.castShadow = false;
  shMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(shMesh);
  const shells = [];
  for (let i = 0; i < SH_MAX; i++) { shells.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, floor: 0, bounced: false }); shMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
  let shNext = 0;

  const emitters = [];
  let splashAcc = 0;

  const fx = {
    group, add, alpha,

    tracer(from, to, o = {}) {
      const dist = from.distanceTo(to);
      if (dist < 1.5) return;
      if (tracers.length >= TR_MAX) tracers.shift();
      tracers.push({ from: from.clone(), dir: to.clone().sub(from).multiplyScalar(1 / dist), dist, t: o.lead ?? 1.2, speed: o.speed ?? 260, len: o.len ?? 11, width: o.width ?? 0.05, color: o.color ?? 0xffb060, gain: o.gain ?? 2.2 });
    },

    sparks(p, n, count = 8, o = {}) {
      const sp = o.speed ?? 5, col = o.color ?? [1.0, 0.75, 0.35];
      for (let i = 0; i < count; i++) {
        const vx = n.x * sp * rnd(0.3, 1) + rnd(-1, 1) * sp * 0.6, vy = n.y * sp * rnd(0.3, 1) + rnd(-0.3, 1) * sp * 0.6, vz = n.z * sp * rnd(0.3, 1) + rnd(-1, 1) * sp * 0.6;
        add.spawn(p.x, p.y, p.z, vx, vy, vz, rnd(0.18, 0.55) * (o.life ?? 1), rnd(0.035, 0.07), 0.01, col[0] * 3, col[1] * 3, col[2] * 3, 1, 9.8, 1.2);
      }
    },

    dust(p, n, o = {}) {
      const c = o.color ?? [0.42, 0.41, 0.39], count = o.count ?? 3, s = o.size ?? 1;
      for (let i = 0; i < count; i++) {
        alpha.spawn(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * rnd(0.4, 1.6) + rnd(-0.4, 0.4), n.y * rnd(0.4, 1.6) + rnd(0, 0.5), n.z * rnd(0.4, 1.6) + rnd(-0.4, 0.4),
          rnd(0.5, 1.1), 0.14 * s, rnd(0.6, 1.1) * s, c[0], c[1], c[2], o.alpha ?? 0.34, -0.15, 1.8);
      }
    },

    smoke(p, o = {}) {
      const c = o.color ?? [0.055, 0.055, 0.06];
      alpha.spawn(p.x + rnd(-0.2, 0.2), p.y, p.z + rnd(-0.2, 0.2), rnd(-0.3, 0.3) + (o.wind ?? 0.5), o.rise ?? rnd(0.9, 1.6), rnd(-0.3, 0.3),
        o.life ?? rnd(2.4, 4), o.size ?? 0.55, (o.size ?? 0.55) * (o.grow ?? 4.2), c[0], c[1], c[2], o.alpha ?? 0.5, 0, 0.25, 0.3);
    },

    decal(p, n, size = 0.09) {
      if (Math.abs(n.y) > 0.99) _q.setFromUnitVectors(ZAXIS, n); else _q.setFromUnitVectors(ZAXIS, n);
      _q2.setFromAxisAngle(ZAXIS, Math.random() * 6.28);
      _q.multiply(_q2);
      _p.copy(p).addScaledVector(n, 0.012);
      _m.compose(_p, _q, _s.set(size, size, size));
      dcMesh.setMatrixAt(dcNext, _m);
      dcNext = (dcNext + 1) % DC_MAX;
      dcCount = Math.min(DC_MAX, dcCount + 1);
      dcMesh.count = dcCount;
      dcMesh.instanceMatrix.needsUpdate = true;
    },

    // 표면 종류에 맞는 피탄 효과
    impact(p, n, surface = 'concrete', o = {}) {
      const s = o.scale ?? 1;
      if (surface === 'metal') {
        fx.sparks(p, n, Math.round(9 * s), { speed: 6 });
        add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.06, 0.5 * s, 0.2, 3, 2.2, 1.2, 1);
        fx.decal(p, n, 0.06 * s);
      } else if (surface === 'glass') {
        fx.sparks(p, n, 5, { speed: 4, color: [0.8, 0.9, 1.0] });
        fx.dust(p, n, { count: 2, color: [0.6, 0.66, 0.7], alpha: 0.22 });
        fx.decal(p, n, 0.12 * s);
      } else if (surface === 'wood') {
        fx.dust(p, n, { count: 3, color: [0.36, 0.28, 0.2] });
        fx.decal(p, n, 0.07 * s);
      } else if (surface === 'sand' || surface === 'cloth') {
        fx.dust(p, n, { count: 4, color: [0.46, 0.42, 0.33], size: 1.2 });
      } else if (surface === 'enemy') {
        fx.sparks(p, n, Math.round(10 * s), { speed: 7, color: [1.0, 0.85, 0.5] });
        add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.07, 0.6 * s, 0.25, 3.2, 2.6, 1.6, 1);
      } else {
        // 콘크리트·아스팔트·벽돌
        fx.dust(p, n, { count: 3, size: s });
        fx.sparks(p, n, 3, { speed: 3.5, life: 0.6 });
        for (let i = 0; i < 4; i++) alpha.spawn(p.x, p.y, p.z, n.x * rnd(1, 3) + rnd(-1.2, 1.2), n.y * rnd(1, 3) + rnd(0, 1.8), n.z * rnd(1, 3) + rnd(-1.2, 1.2), rnd(0.4, 0.8), 0.03, 0.02, 0.2, 0.2, 0.2, 0.9, 9.8, 0.4);
        fx.decal(p, n, 0.1 * s);
      }
      G.events.emit('world/impact', { point: p, surface, quiet: !!o.quiet });
    },

    explosion(p, o = {}) {
      const s = o.scale ?? 1;
      for (let i = 0; i < 3; i++) add.spawn(p.x + rnd(-0.2, 0.2) * s, p.y + rnd(-0.1, 0.2) * s, p.z + rnd(-0.2, 0.2) * s, 0, 0.5, 0, rnd(0.1, 0.22), 1.2 * s, 3.2 * s, 4.5, 2.6, 0.9, 1);
      for (let i = 0; i < 34 * s; i++) {
        const a = Math.random() * 6.28, e = rnd(-0.4, 1), sp = rnd(4, 15) * s;
        add.spawn(p.x, p.y, p.z, Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp + 2, Math.sin(a) * sp * Math.cos(e), rnd(0.35, 1.0), rnd(0.04, 0.09), 0.01, 3.2, 2.0, 0.7, 1, 9.8, 0.8);
      }
      for (let i = 0; i < 9; i++) fx.smoke(p, { size: rnd(0.5, 0.9) * s, grow: 3.4, life: rnd(1.4, 2.8), rise: rnd(0.5, 1.4), alpha: 0.55, wind: rnd(-0.4, 0.8) });
      G.render.flash(p, 0xffa040, 90 * s, 20 * s, 0.22);
    },

    shell(p, v) {
      const s = shells[shNext];
      shNext = (shNext + 1) % SH_MAX;
      s.on = true; s.p.copy(p); s.v.copy(v); s.life = 0; s.bounced = false;
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.w.set(rnd(-18, 18), rnd(-18, 18), rnd(-18, 18));
      s.floor = phys.groundAt(p.x, p.z, p.y, 0) + 0.012;
    },

    // 지속 방출기. type: 'fire' | 'smoke' | 'signal'(녹색 연막) | 'sparks'
    addEmitter(type, pos, o = {}) {
      const e = { type, pos: pos.clone(), acc: 0, acc2: 0, on: true, ttl: o.ttl ?? Infinity, o };
      emitters.push(e);
      return { stop() { e.on = false; }, setPos(p) { e.pos.copy(p); }, emitter: e };
    },

    clear() {
      add.clear(); alpha.clear(); tracers.length = 0; trMesh.count = 0;
      dcCount = 0; dcNext = 0; dcMesh.count = 0;
      for (let i = 0; i < SH_MAX; i++) { shells[i].on = false; shMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
      shMesh.instanceMatrix.needsUpdate = true;
      for (let i = emitters.length - 1; i >= 0; i--) if (emitters[i].o.temp) emitters.splice(i, 1);
    },

    update(dt) {
      const t = G.time.t;
      const scale = G.render.size.bh / (2 * Math.tan((cam.fov * Math.PI) / 360));
      add.uniforms.uScale.value = scale; alpha.uniforms.uScale.value = scale;

      // 방출기
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i];
        e.ttl -= dt;
        if (!e.on || e.ttl <= 0) { emitters.splice(i, 1); continue; }
        const p = e.pos;
        if (e.type === 'fire') {
          e.acc += dt * 30;
          while (e.acc > 1) {
            e.acc -= 1;
            add.spawn(p.x + rnd(-0.7, 0.7), p.y + rnd(-0.2, 0.2), p.z + rnd(-0.5, 0.5), rnd(-0.3, 0.5), rnd(1.4, 3.0), rnd(-0.3, 0.3), rnd(0.35, 0.8), rnd(0.5, 0.8), 0.12, 2.4, rnd(0.8, 1.3), 0.25, 0.9, -0.6, 0.6);
          }
          e.acc2 += dt * 5;
          while (e.acc2 > 1) {
            e.acc2 -= 1;
            fx.smoke({ x: p.x, y: p.y + 1.0, z: p.z }, { size: 0.7, grow: 4.5, alpha: 0.42, wind: 0.7 });
            if (Math.random() < 0.6) add.spawn(p.x + rnd(-0.5, 0.5), p.y + 0.4, p.z + rnd(-0.4, 0.4), rnd(-0.6, 1.2), rnd(2, 4.5), rnd(-0.6, 0.6), rnd(0.8, 1.8), 0.05, 0.02, 3, 1.4, 0.4, 1, -0.4, 0.5);
          }
        } else if (e.type === 'signal') {
          e.acc += dt * 16;
          while (e.acc > 1) { e.acc -= 1; fx.smoke(p, { color: [0.09, 0.34, 0.13], size: 0.4, grow: 6, life: rnd(3, 5), rise: rnd(0.7, 1.3), alpha: 0.6, wind: 0.6 }); }
        } else if (e.type === 'smoke') {
          e.acc += dt * (e.o.rate ?? 6);
          while (e.acc > 1) { e.acc -= 1; fx.smoke(p, { size: e.o.size ?? 0.4, grow: 4, alpha: 0.4, wind: 0.5 }); }
        } else if (e.type === 'sparks') {
          e.acc += dt * (e.o.rate ?? 3);
          while (e.acc > 1) { e.acc -= 1; if (Math.random() < 0.6) { fx.sparks(p, { x: rnd(-0.5, 0.5), y: 0.6, z: rnd(-0.5, 0.5) }, 6, { speed: 3.5, color: [0.7, 0.85, 1.0] }); G.render.flash(p, 0x9fd0ff, 14, 7, 0.07); } }
        }
      }

      // 빗방울 튐
      if (rain) {
        const u = rain.userData.uniforms;
        u.uTime.value = t; u.uCam.value.copy(cam.position);
        const inside = G.level && G.level.isInterior && G.level.isInterior(cam.position);
        u.uAlpha.value += ((inside ? 0.06 : 0.2) - u.uAlpha.value) * Math.min(1, dt * 4);
        splashAcc += dt * 110 * (G.quality.rain ?? 1);
        while (splashAcc > 1) {
          splashAcc -= 1;
          const a = Math.random() * 6.28, d = 1.5 + Math.random() * 13;
          const x = cam.position.x + Math.cos(a) * d, z = cam.position.z + Math.sin(a) * d;
          add.spawn(x, 0.03, z, 0, rnd(0.3, 0.9), 0, rnd(0.1, 0.2), 0.04, 0.12, 0.35, 0.42, 0.52, 0.5, 4, 0);
        }
      }

      add.update(dt); alpha.update(dt);

      // 예광탄
      let n = 0;
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        tr.t += tr.speed * dt;
        const head = Math.min(tr.t, tr.dist), tail = Math.max(0, tr.t - tr.len);
        if (tail >= tr.dist) { tracers.splice(i, 1); continue; }
        const len = Math.max(0.05, head - tail);
        _mid.copy(tr.from).addScaledVector(tr.dir, (head + tail) / 2);
        _x.copy(tr.dir);
        _z.subVectors(cam.position, _mid);
        _y.crossVectors(_z, _x).normalize();
        _z.crossVectors(_x, _y);
        const w = tr.width * (1 + _mid.distanceTo(cam.position) * 0.035);
        _m.makeBasis(_x.clone().multiplyScalar(len), _y.multiplyScalar(w), _z).setPosition(_mid);
        trMesh.setMatrixAt(n, _m);
        trMesh.setColorAt(n, _c.set(tr.color).multiplyScalar(tr.gain));
        n++;
      }
      trMesh.count = n;
      if (n) { trMesh.instanceMatrix.needsUpdate = true; if (trMesh.instanceColor) trMesh.instanceColor.needsUpdate = true; }

      // 탄피
      let any = false;
      for (let i = 0; i < SH_MAX; i++) {
        const s = shells[i];
        if (!s.on) continue;
        any = true;
        s.life += dt;
        s.v.y -= 9.8 * dt;
        s.p.addScaledVector(s.v, dt);
        s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
        if (s.p.y < s.floor) {
          s.p.y = s.floor;
          if (Math.abs(s.v.y) > 0.8) {
            s.v.y *= -0.35; s.v.x *= 0.55; s.v.z *= 0.55; s.w.multiplyScalar(0.5);
            if (!s.bounced) { s.bounced = true; G.events.emit('casing/drop', { pos: s.p }); }
          } else { s.v.set(0, 0, 0); s.w.set(0, 0, 0); s.r.x = Math.PI / 2; }
        }
        if (s.life > 6) { s.on = false; shMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        _q.setFromEuler(s.r);
        shMesh.setMatrixAt(i, _m.compose(s.p, _q, _s.set(1, 1, 1)));
      }
      if (any) shMesh.instanceMatrix.needsUpdate = true;
    },
  };

  // 레벨이 정해 둔 화재
  if (G.level && G.level.emitters) for (const e of G.level.emitters) fx.addEmitter(e.type, e.pos);
  return fx;
}

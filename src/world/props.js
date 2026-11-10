import * as THREE from 'three';

// 소품 제작 함수 모음. 모든 치수는 미터. B는 world/build.js의 빌더.
// 각 소품은 B.push(x, 0, z, yaw)로 자기 좌표계를 잡는다(길이 방향이 지역 +X).

export const CAR_COLORS = [0xd8d8d4, 0x15171b, 0x7c8288, 0x24365c, 0x7a1717, 0xe6e2d6, 0x3a4a3c];

function wheel(B, x, z0, r, w, burnt) {
  B.cyl('rubber', x, r, z0, r, w, { axis: 'z', seg: 14, color: burnt ? 0x0c0b0a : 0x1d1d20 });
  if (!burnt) B.cyl('steel', x, r, z0 - 0.005, r * 0.56, w + 0.01, { axis: 'z', seg: 10, color: 0x9aa0a6 });
}

export function car(B, x, z, yaw, o = {}) {
  const suv = o.type === 'suv', burnt = !!o.burnt;
  const col = burnt ? 0x17120e : (o.color ?? CAR_COLORS[0]);
  const body = burnt ? 'matte' : 'carpaint';
  const L = suv ? 4.7 : 4.5, W = 1.84, low = suv ? 0.96 : 0.8, top = suv ? 1.74 : 1.44;
  const hl = L / 2, hw = W / 2, sink = burnt ? -0.08 : 0;
  B.push(x, sink, z, yaw);
  B.taper(body, -hl, hl, -hw, hw, -hl + 0.08, hl - 0.14, -hw + 0.05, hw - 0.05, 0.3, low, { color: col, surface: 'metal' });
  const c0 = -hl + (suv ? 0.22 : 0.92), c1 = hl - 1.28;
  B.taper(burnt ? 'matte' : 'glass', c0, c1, -hw + 0.07, hw - 0.07, c0 + (suv ? 0.14 : 0.5), c1 - 0.56, -hw + 0.2, hw - 0.2, low, top - 0.05,
    { color: burnt ? 0x070605 : 0x0e151c, surface: 'glass' });
  B.box(body, c0 + (suv ? 0.1 : 0.44), top - 0.07, -hw + 0.17, c1 - 0.5, top, hw - 0.17, { color: col, collide: false });
  // 필러
  for (const sx of [c0 + (suv ? 0.2 : 0.55), (c0 + c1) / 2, c1 - 0.6]) for (const sz of [-1, 1]) {
    B.box(body, sx - 0.04, low, sz * (hw - 0.13) - 0.03, sx + 0.04, top - 0.05, sz * (hw - 0.13) + 0.03, { color: col, collide: false, rx: sz * 0.16 });
  }
  B.box('matte', -hl - 0.04, 0.3, -hw + 0.1, -hl + 0.04, 0.52, hw - 0.1, { color: 0x121214, collide: false });
  B.box('matte', hl - 0.04, 0.3, -hw + 0.1, hl + 0.04, 0.52, hw - 0.1, { color: 0x121214, collide: false });
  if (!burnt) {
    for (const sz of [-1, 1]) {
      B.box('matte', hl - 0.03, 0.58, sz * 0.6 - 0.17, hl + 0.015, 0.72, sz * 0.6 + 0.17, { color: 0xc9ced2, collide: false });
      B.box('matte', -hl - 0.015, 0.6, sz * 0.62 - 0.16, -hl + 0.03, 0.74, sz * 0.62 + 0.16, { color: 0x4a0707, collide: false });
    }
    if (o.type === 'taxi') B.box('matte', -0.25, top, -0.2, 0.05, top + 0.13, 0.2, { color: 0xd9b21c, collide: false });
  }
  const wr = suv ? 0.37 : 0.33;
  for (const wx of [hl - 0.86, -hl + 0.86]) { wheel(B, wx, -hw - 0.01, wr, 0.23, burnt); wheel(B, wx, hw - 0.22, wr, 0.23, burnt); }
  B.pop();
}

// 1톤 트럭(파란 화물차)
export function truck1t(B, x, z, yaw, o = {}) {
  const col = o.color ?? 0x1c56a8;
  B.push(x, 0, z, yaw);
  B.box('matte', -2.45, 0.4, -0.78, 2.3, 0.6, 0.78, { color: 0x141416, collide: false });
  B.taper('carpaint', 0.95, 2.32, -0.84, 0.84, 1.05, 2.06, -0.78, 0.78, 0.55, 1.98, { color: col, surface: 'metal' });
  B.box('glass', 2.2, 1.18, -0.7, 2.27, 1.82, 0.7, { color: 0x0e151c, collide: false, rz: -0.12 });
  for (const sz of [-1, 1]) B.box('glass', 1.25, 1.2, sz * 0.82 - 0.012, 1.95, 1.8, sz * 0.82 + 0.012, { color: 0x0e151c, collide: false });
  B.box('metal', -2.5, 0.6, -0.86, 0.95, 0.72, 0.86, { color: col, collide: false });
  for (const sz of [-1, 1]) B.box('metal', -2.5, 0.72, sz * 0.86 - 0.025, 0.95, 1.08, sz * 0.86 + 0.025, { color: col, collide: false });
  B.box('metal', -2.52, 0.72, -0.86, -2.47, 1.08, 0.86, { color: col, collide: false });
  B.box('metal', 0.9, 0.72, -0.86, 0.95, 1.5, 0.86, { color: 0x30343a, collide: false });
  if (o.cargo !== false) B.box('tarp', -2.3, 0.72, -0.76, 0.7, 1.5, 0.76, { color: o.cargoColor ?? 0x3d5f8f, collide: false });
  B.collide(-2.5, 0, -0.86, 0.95, o.cargo !== false ? 1.5 : 1.08, 0.86, { surface: 'metal' });
  for (const wx of [1.62, -1.55]) { wheel(B, wx, -0.86, 0.3, 0.2, false); wheel(B, wx, 0.66, 0.3, 0.2, false); }
  B.pop();
}

// 시내버스
export function bus(B, x, z, yaw, o = {}) {
  const burnt = !!o.burnt, col = burnt ? 0x1a1512 : (o.color ?? 0x2f8f58), body = burnt ? 'matte' : 'carpaint';
  B.push(x, burnt ? -0.1 : 0, z, yaw);
  B.box(body, -5.4, 0.42, -1.25, 5.4, 3.05, 1.25, { color: col, surface: 'metal' });
  B.box(body, -5.3, 3.05, -1.0, 5.1, 3.2, 1.0, { color: burnt ? 0x120f0d : 0xd8d8d2, collide: false });
  const gl = burnt ? 'matte' : 'glass', gc = burnt ? 0x050505 : 0x0e151c;
  for (const sz of [-1, 1]) {
    B.box(gl, -5.0, 1.45, sz * 1.26 - 0.012, 4.5, 2.5, sz * 1.26 + 0.012, { color: gc, collide: false });
    for (let k = 0; k < 7; k++) B.box(body, -5.0 + k * 1.36 - 0.04, 1.45, sz * 1.27 - 0.012, -5.0 + k * 1.36 + 0.04, 2.5, sz * 1.27 + 0.012, { color: col, collide: false });
    if (!burnt) B.box('matte', -5.2, 0.9, sz * 1.262 - 0.01, 5.2, 1.08, sz * 1.262 + 0.01, { color: 0xe8e8e2, collide: false });
  }
  B.box(gl, 5.39, 1.3, -1.1, 5.42, 2.6, 1.1, { color: gc, collide: false });
  B.box(gl, -5.42, 1.6, -1.0, -5.39, 2.5, 1.0, { color: gc, collide: false });
  B.box('matte', 5.4, 2.66, -0.9, 5.43, 2.96, 0.9, { color: burnt ? 0x080808 : 0x16120a, collide: false });
  for (const wx of [3.5, -3.3]) { wheel(B, wx, -1.27, 0.5, 0.3, burnt); wheel(B, wx, 0.97, 0.5, 0.3, burnt); }
  B.pop();
}

// 콘크리트 방호벽
export function jersey(B, x, z, yaw, o = {}) {
  B.push(x, 0, z, yaw);
  B.taper('concrete', -1.0, 1.0, -0.3, 0.3, -1.0, 1.0, -0.09, 0.09, 0, 0.82, { color: o.color ?? 0xb9b6ae, surface: 'concrete' });
  if (o.stripe) B.box('matte', -0.98, 0.5, -0.19, 0.98, 0.64, 0.19, { color: 0xc8501a, collide: false });
  B.pop();
}

// 사낭 벽. 축에 나란한 구간만(충돌 박스가 딱 맞도록). rows: 단 수
export function sandbags(B, x0, z0, x1, z1, rows = 5, o = {}) {
  const rng = o.rng || Math.random;
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
  const bagL = 0.6, bagH = 0.2, thick = o.thick ?? 1;
  const n = Math.max(1, Math.round(len / bagL));
  B.push(x0, 0, z0, ang);
  for (let r = 0; r < rows; r++) for (let d = 0; d < thick; d++) {
    const off = (r & 1) ? bagL / 2 : 0, count = (r & 1) ? n - 1 : n;
    for (let i = 0; i < count; i++) {
      const g = new THREE.SphereGeometry(0.5, 8, 5);
      g.scale(0.66, 0.26, 0.38);
      g.rotateY((rng() - 0.5) * 0.24);
      g.translate(off + (i + 0.5) * (len / n), bagH * (r + 0.5) + 0.01, (d - (thick - 1) / 2) * 0.34 + (rng() - 0.5) * 0.04);
      B.add('sandbag', g, rng() < 0.5 ? 0x8a8062 : 0x74775a);
    }
  }
  B.collide(0, 0, -0.19 * thick - 0.02, len, rows * bagH + 0.02, 0.19 * thick + 0.02, { surface: 'sand' });
  B.pop();
}

export function crate(B, x, y, z, w, h, d, o = {}) {
  B.box(o.mat ?? 'wood', x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, { color: o.color ?? 0xffffff, surface: o.surface ?? 'wood', ry: o.ry });
}

export function barrel(B, x, z, color = 0x2a4f8a, y = 0) {
  B.cyl('metal', x, y, z, 0.29, 0.88, { color, collide: true, surface: 'metal', seg: 12 });
  B.cyl('metal', x, y + 0.86, z, 0.3, 0.03, { color, seg: 12 });
}

export function cone(B, x, z) {
  B.box('matte', x - 0.18, 0, z - 0.18, x + 0.18, 0.03, z + 0.18, { color: 0x1a1a1a, collide: false });
  B.cyl('matte', x, 0.03, z, 0.15, 0.5, { rTop: 0.03, color: 0xd9541a, seg: 10 });
  B.cyl('matte', x, 0.25, z, 0.105, 0.09, { rTop: 0.085, color: 0xe8e6e0, seg: 10 });
}

// 대전차 장애물(강철 빔 세 개)
export function hedgehog(B, x, z, yaw = 0) {
  for (let k = 0; k < 3; k++) {
    B.push(x, 0, z, yaw + k * 2.094);
    B.box('steel', -0.85, 0.5, -0.07, 0.85, 0.64, 0.07, { rz: 0.82, color: 0x6a5a4c, collide: false });
    B.pop();
  }
  B.push(x, 0, z, 0);
  B.collide(-0.45, 0, -0.45, 0.45, 1.15, 0.45, { surface: 'metal' });
  B.pop();
}

// 윤형 철조망. 걸어서는 못 지나가고 총알은 통과한다.
export function razorWire(B, x0, z0, x1, z1, o = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0), r = o.r ?? 0.42;
  const turns = Math.round(len / 0.34), pts = [];
  for (let i = 0; i <= turns * 8; i++) {
    const t = i / (turns * 8), a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(t * len, r + 0.03 + Math.cos(a) * r, Math.sin(a) * r));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 8, 0.011, 3, false);
  B.push(x0, 0, z0, ang);
  B.add('steel', g, 0x8f959a);
  B.collide(0, 0, -r, len, r * 2 + 0.1, r, { bodyOnly: true });
  B.pop();
}

// 전봇대. 전선을 걸 점(월드 좌표)을 돌려준다.
export function utilityPole(B, x, z, o = {}) {
  const h = o.h ?? 9.2, alongX = o.alongX !== false;
  B.push(x, 0, z, 0);
  B.cyl('concrete', 0, 0, 0, 0.17, h, { rTop: 0.12, color: 0x9a9890, seg: 10 });
  B.collide(-0.16, 0, -0.16, 0.16, h, 0.16, { surface: 'concrete' });
  const arms = [];
  for (const [y, half] of [[h - 0.5, 1.0], [h - 1.3, 0.8]]) {
    if (alongX) B.box('steel', -0.05, y, -half, 0.05, y + 0.09, half, { color: 0x4a4d50, collide: false });
    else B.box('steel', -half, y, -0.05, half, y + 0.09, 0.05, { color: 0x4a4d50, collide: false });
    for (const s of [-1, 0, 1]) {
      const p = alongX ? [0, y + 0.16, s * half * 0.9] : [s * half * 0.9, y + 0.16, 0];
      B.cyl('matte', p[0], y + 0.09, p[2], 0.035, 0.1, { color: 0x6a4a3a, seg: 6 });
      arms.push(B.toWorld(p[0], p[1], p[2]));
    }
  }
  if (o.transformer !== false) {
    B.cyl('matte', 0.36, h - 3.1, 0, 0.27, 0.72, { color: 0x8c9094, seg: 12 });
    B.box('steel', 0, h - 2.5, -0.04, 0.4, h - 2.44, 0.04, { color: 0x4a4d50, collide: false });
  }
  B.pop();
  return arms;
}

// 처진 전선
export function wire(B, a, b, sag = 0.6, radius = 0.016) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y -= sag;
  const g = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, radius, 3, false);
  B.add('rubber', g, 0x101012);
}

// 가로등. 등기구 위치(월드)를 돌려준다. dz: 팔이 뻗는 방향(+1/-1)
export function streetLamp(B, x, z, dz, on) {
  B.push(x, 0, z, 0);
  B.cyl('steel', 0, 0, 0, 0.09, 7.4, { rTop: 0.06, color: 0x3a4640, seg: 8 });
  B.collide(-0.1, 0, -0.1, 0.1, 7.4, 0.1, { surface: 'metal' });
  B.box('steel', -0.04, 7.3, Math.min(0, dz * 1.9), 0.04, 7.38, Math.max(0, dz * 1.9), { color: 0x3a4640, collide: false });
  B.box('matte', -0.16, 7.22, dz * 1.55 - 0.32, 0.16, 7.36, dz * 1.55 + 0.32, { color: 0x2a2f2c, collide: false });
  B.box(on ? B.G.mats.emissive(0xffb060, 5) : 'glass', -0.12, 7.19, dz * 1.55 - 0.26, 0.12, 7.22, dz * 1.55 + 0.26, { color: 0x30342f, collide: false });
  const p = B.toWorld(0, 7.15, dz * 1.55);
  B.pop();
  return p;
}

// 포장마차
export function pojangmacha(B, x, z, yaw, o = {}) {
  const tarp = o.color ?? 0xdf5a1c;
  B.push(x, o.y ?? 0, z, yaw);
  for (const px of [-1.6, 1.6]) for (const pz of [-1.05, 1.05]) B.cyl('steel', px, 0, pz, 0.025, 2.2, { color: 0x6c7074, seg: 6 });
  // 지붕(가운데가 솟은 두 장)과 뒷·옆 막
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  const q = (a, b, c, d) => B.add('tarp', quadOf(a, b, c, d), tarp);
  q(V(-1.75, 2.2, 1.2), V(1.75, 2.2, 1.2), V(1.75, 2.48, 0), V(-1.75, 2.48, 0));
  q(V(-1.75, 2.48, 0), V(1.75, 2.48, 0), V(1.75, 2.2, -1.2), V(-1.75, 2.2, -1.2));
  q(V(1.6, 0.25, -1.05), V(-1.6, 0.25, -1.05), V(-1.6, 2.2, -1.05), V(1.6, 2.2, -1.05));
  q(V(-1.6, 0.25, -1.05), V(-1.6, 0.25, 0.5), V(-1.6, 2.2, 0.5), V(-1.6, 2.2, -1.05));
  q(V(1.6, 0.25, 0.5), V(1.6, 0.25, -1.05), V(1.6, 2.2, -1.05), V(1.6, 2.2, 0.5));
  // 조리대
  B.box('steel', -1.3, 0.8, -0.75, 1.3, 0.86, -0.15, { color: 0xb4b8bc, surface: 'metal', collide: false });
  B.box('matte', -1.3, 0, -0.75, 1.3, 0.8, -0.2, { color: 0x1d4f8a, surface: 'metal' });
  B.cyl('steel', -0.6, 0.86, -0.45, 0.2, 0.22, { color: 0x8a8e92, seg: 10 });
  B.cyl('steel', 0.3, 0.86, -0.45, 0.26, 0.12, { color: 0x3a3c3e, seg: 10 });
  for (const [sx, sz] of [[-0.9, 0.35], [-0.2, 0.5], [0.6, 0.38], [1.15, 0.6]]) B.cyl('matte', sx, 0, sz, 0.15, 0.44, { rTop: 0.13, color: 0xb01c1c, seg: 8 });
  B.box(B.G.mats.emissive(0xffc27a, 6), -0.05, 1.98, -0.05, 0.05, 2.1, 0.05, { collide: false });
  const p = B.toWorld(0, 1.9, 0);
  B.pop();
  return p;
}
function quadOf(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z]), 3));
  const w = a.distanceTo(b) / 2, h = a.distanceTo(d) / 2;
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, w, 0, w, h, 0, 0, w, h, 0, h]), 2));
  g.computeVertexNormals();
  return g;
}

// 자판기(앞면 발광)
export function vending(B, x, z, yaw, o = {}) {
  B.push(x, o.y ?? 0, z, yaw);
  B.box('metal', -0.5, 0, -0.38, 0.5, 1.9, 0.38, { color: o.color ?? 0xb3202a, surface: 'metal' });
  B.box(B.G.mats.emissive(o.glow ?? 0xcfe8ff, 2.2), -0.42, 0.75, 0.381, 0.2, 1.78, 0.39, { collide: false });
  B.box('matte', 0.26, 0.9, 0.381, 0.44, 1.5, 0.39, { color: 0x101010, collide: false });
  B.box('matte', -0.42, 0.2, 0.381, 0.44, 0.5, 0.39, { color: 0x101010, collide: false });
  B.pop();
}

// 잔해 더미
export function rubble(B, x, z, r, n, rng) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    const w = rng.range(0.18, 0.75), h = rng.range(0.08, 0.38), dp = rng.range(0.18, 0.6);
    B.push(x + Math.cos(a) * d, 0, z + Math.sin(a) * d, rng() * Math.PI);
    B.box(rng() < 0.75 ? 'concrete' : 'brick', -w / 2, -0.02, -dp / 2, w / 2, h, dp / 2,
      { color: rng() < 0.5 ? 0x8a8780 : 0x6c6a66, rx: rng.range(-0.25, 0.25), rz: rng.range(-0.3, 0.3), collide: false });
    B.pop();
  }
}

export function dumpster(B, x, z, yaw, color = 0x2c5a3a) {
  B.push(x, 0, z, yaw);
  B.taper('metal', -0.85, 0.85, -0.5, 0.5, -0.95, 0.95, -0.55, 0.55, 0.08, 1.15, { color, surface: 'metal' });
  B.box('metal', -0.97, 1.15, -0.57, 0.97, 1.21, 0.57, { color: 0x1c1e20, collide: false, rx: 0.06 });
  B.pop();
}

// 해상 컨테이너(20피트)
export function container(B, x, z, yaw, color = 0x7a2f22, y = 0) {
  B.push(x, y, z, yaw);
  B.box('corrugated', -3.03, 0, -1.22, 3.03, 2.59, 1.22, { color, surface: 'metal' });
  for (const sz of [-0.6, -0.2, 0.2, 0.6]) B.cyl('steel', 3.04, 0.15, sz, 0.02, 2.3, { color: 0x9aa0a4, seg: 6 });
  B.box('steel', -3.05, 0, -1.24, 3.05, 0.12, 1.24, { color: 0x30302e, collide: false });
  B.box('steel', -3.05, 2.5, -1.24, 3.05, 2.6, 1.24, { color: 0x30302e, collide: false });
  B.pop();
}

// 옥상 물탱크
export function waterTank(B, x, y, z, color = 0xd3b22a) {
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) B.box('steel', x + dx - 0.04, y, z + dz - 0.04, x + dx + 0.04, y + 0.6, z + dz + 0.04, { color: 0x5a5d60, collide: false });
  B.cyl('matte', x, y + 0.6, z, 0.78, 1.25, { color, seg: 14 });
  B.cyl('matte', x, y + 1.85, z, 0.78, 0.18, { rTop: 0.2, color, seg: 14 });
}

// 차륜형 장갑차(회수 지점의 아군 차량)
export function apc(B, x, z, yaw) {
  const col = 0x3b4430;
  B.push(x, 0, z, yaw);
  B.taper('matte', -3.6, 3.3, -1.35, 1.35, -3.3, 2.5, -1.12, 1.12, 0.62, 2.12, { color: col, surface: 'metal' });
  B.taper('matte', 3.3, 3.95, -1.35, 1.35, 2.5, 2.9, -1.1, 1.1, 0.62, 1.5, { color: col, surface: 'metal' });
  B.box('matte', -3.5, 0.36, -1.2, 3.6, 0.62, 1.2, { color: 0x23281d, collide: false });
  B.cyl('matte', -0.4, 2.12, 0, 0.62, 0.38, { color: col, seg: 10 });
  B.cyl('steel', 0.1, 2.3, 0, 0.045, 1.5, { axis: 'x', color: 0x23261f, seg: 8 });
  B.cyl('steel', -2.9, 2.12, -0.9, 0.012, 2.3, { color: 0x1b1d19, seg: 4 });
  for (const wx of [-2.55, -0.95, 0.75, 2.4]) { wheel(B, wx, -1.38, 0.56, 0.34, false); wheel(B, wx, 1.04, 0.56, 0.34, false); }
  B.box(B.G.mats.emissive(0x58ff7a, 3), -3.62, 1.7, -0.9, -3.6, 1.78, -0.78, { collide: false });
  B.box(B.G.mats.emissive(0x58ff7a, 3), -3.62, 1.7, 0.78, -3.6, 1.78, 0.9, { collide: false });
  B.pop();
}

// 군용 화물차(출발 지점 바리케이드)
export function milTruck(B, x, z, yaw) {
  const col = 0x3b4430;
  B.push(x, 0, z, yaw);
  B.box('matte', -3.5, 0.75, -1.05, 3.4, 1.0, 1.05, { color: 0x1e211a, collide: false });
  B.taper('matte', 1.5, 3.3, -1.15, 1.15, 1.6, 3.0, -1.08, 1.08, 1.0, 2.75, { color: col, surface: 'metal' });
  B.box('glass', 3.05, 1.9, -0.95, 3.2, 2.55, 0.95, { color: 0x0e151c, collide: false, rz: -0.2 });
  B.box('tarp', -3.5, 1.0, -1.2, 1.35, 3.0, 1.2, { color: 0x4a5238, surface: 'cloth' });
  B.collide(-3.5, 0, -1.2, 3.4, 1.0, 1.2, { surface: 'metal' });
  for (const wx of [2.45, -1.6, -2.75]) { wheel(B, wx, -1.2, 0.55, 0.32, false); wheel(B, wx, 0.88, 0.55, 0.32, false); }
  B.pop();
}

// 놀이터 그네
export function swingSet(B, x, z, yaw) {
  B.push(x, 0, z, yaw);
  for (const sx of [-1.5, 1.5]) for (const lean of [-1, 1]) B.box('steel', sx - 0.035, 0, -0.035, sx + 0.035, 2.4, 0.035, { color: 0x2a5ea8, rx: lean * 0.3, collide: false });
  B.cyl('steel', -1.55, 2.28, 0, 0.04, 3.1, { axis: 'x', color: 0xc8a020, seg: 8 });
  for (const sx of [-0.6, 0.6]) {
    for (const cx of [-0.2, 0.2]) B.cyl('steel', sx + cx, 0.55, 0, 0.008, 1.75, { color: 0x8a8e92, seg: 4 });
    B.box('rubber', sx - 0.24, 0.5, -0.09, sx + 0.24, 0.54, 0.09, { color: 0x151515, collide: false });
  }
  B.collide(-1.6, 0, -0.1, -1.4, 2.3, 0.1, { surface: 'metal' });
  B.collide(1.4, 0, -0.1, 1.6, 2.3, 0.1, { surface: 'metal' });
  B.pop();
}

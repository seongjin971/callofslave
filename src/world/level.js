import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuilder, quadGeo, mergeParts, boxGeo } from './build.js';
import * as P from './props.js';
import { SIGN } from '../mats/signs.js';

// 레벨: 의정부 상가 골목. 동서로 뻗은 거리(X축) 양쪽에 상가가 늘어서고,
// 북쪽 공터(교란기 A), 남쪽 놀이터 마당(B), 동쪽 차단선(C), 남동쪽 회수 지점으로 이어진다.
// 북(-Z)이 전선 방향이다.

const GH = 3.6;        // 1층 높이
const FH = 3.0;        // 위층 한 층 높이
const SZ = 7;          // 건물 전면선(z = ±7)
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createLevel(G) {
  const B = createBuilder(G), rng = G.rng, mats = G.mats, cells = mats.signs.cells, physics = G.physics;
  const root = new THREE.Group();
  root.name = 'level';
  G.scene.add(root);
  const lights = [], coneGeos = [], interiorBoxes = [], emitters = [];

  let hPool = [], vPool = [];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nextH = () => { if (!hPool.length) hPool = shuffle([...Array(19).keys()]); return hPool.pop(); };
  const nextV = () => { if (!vPool.length) vPool = shuffle([...Array(cells.v.length).keys()]); return vPool.pop(); };
  const signState = () => { const r = rng(); return r < 0.27 ? 'lit' : r < 0.35 ? 'flicker' : 'off'; };

  function addLight(pos, rgb, intensity, distance, kind = '') {
    const l = new THREE.PointLight(new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]), intensity, distance, 2);
    l.position.copy(pos);
    l.userData = { base: intensity, kind, seed: rng() * 100 };
    G.render.addLight(l);
    lights.push(l);
    return l;
  }
  // 가로등 아래 빛기둥(가산 혼합 원뿔)
  function lightCone(pos, rgb, radius = 4.4, height = 7.1) {
    const g = new THREE.ConeGeometry(radius, height, 24, 1, true);
    g.translate(0, -height / 2, 0);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = Math.pow(Math.max(0, 1 + g.attributes.position.getY(i) / height), 2.2);
      col[i * 3] = rgb[0] * k; col[i * 3 + 1] = rgb[1] * k; col[i * 3 + 2] = rgb[2] * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(pos.x, pos.y, pos.z);
    coneGeos.push(g);
  }

  // =====================================================================  바닥
  B.box('asphalt', -76, -0.5, -76, 76, 0, 76, { collide: false, uo: 0, vo: 0 });
  for (const s of [-1, 1]) {
    const z0 = s < 0 ? -SZ : 4, z1 = s < 0 ? -4 : SZ;
    B.box('sidewalk', -62, 0, z0, 62, 0.15, z1, { surface: 'concrete', navFree: true, uo: 0, vo: 0 });
    B.box('concrete', -62, 0, s * 4 - 0.1, 62, 0.17, s * 4 + 0.1, { collide: false, color: 0xa9a79f });
  }
  const paint = (x0, z0, x1, z1, color = 0xe6e6e0) => B.box('paint', x0, 0, z0, x1, 0.008, z1, { collide: false, color });
  for (let x = -57; x < 56; x += 7) {
    if (rng() < 0.15) continue;
    paint(x, -0.21, x + 6.6, -0.09, 0xd4a520); paint(x, 0.09, x + 6.6, 0.21, 0xd4a520);
  }
  paint(-57, -3.76, 57, -3.64); paint(-57, 3.64, 57, 3.76);
  for (const xc of [-22, 16]) {
    for (let k = 0; k < 9; k++) paint(xc - 1.7, -3.55 + k * 0.82, xc + 1.7, -3.55 + k * 0.82 + 0.46);
    paint(xc - 3.5, -3.6, xc - 3.1, -0.3); paint(xc + 3.1, 0.3, xc + 3.5, 3.6);
  }
  for (let k = 0; k < 10; k++) paint(-37.5 + k * 2.6, -39.6, -37.38 + k * 2.6, -34.6);      // 북쪽 공터 주차선
  for (let k = 0; k < 5; k++) paint(33 + k * 2.6, 34.4, 33.12 + k * 2.6, 39.6);              // 남쪽 마당 주차선

  // =====================================================================  건물
  const AWNING = [0x8f3026, 0x2b6447, 0x2a4a82, 0xa87418];

  function shop(xa, xb, d, def, gmat, gtint) {
    const kind = def?.kind ?? (rng() < 0.18 ? 'glass' : 'shutter');
    const sIdx = def?.sign ?? nextH(), state = def?.state ?? signState();
    const zr = -0.22, gh = d.gh ?? GH, w = xb - xa;
    const sh = Math.min(1.05, Math.max(0.7, (w - 0.5) / 4.4)), sy1 = gh - 0.06, sy0 = sy1 - sh, doorTop = Math.min(2.5, sy0 - 0.08);
    B.wall(gmat, xa, zr, xb, zr, doorTop, gh, { color: gtint });
    if (kind === 'shutter') {
      B.wall('shutter', xa + 0.22, zr, xb - 0.22, zr, 0.03, doorTop, { u: [0, Math.max(1, Math.round(w / 3))], v: [0, 1], color: rng.pick([0xc9ccce, 0xa9b2a6, 0xb8b0a0, 0x9aa3ad]) });
    } else {
      B.wall(gmat, xa + 0.22, zr, xb - 0.22, zr, 0, 0.45, { color: gtint });
      if (def?.store) B.wall('store_interior', xa + 0.22, zr, xb - 0.22, zr, 0.45, doorTop, { u: [0, 1], v: [0, 1] });
      else B.wall('glass', xa + 0.22, zr, xb - 0.22, zr, 0.45, doorTop, { color: 0x0e151c });
      const n = Math.max(2, Math.round(w / 1.4));
      for (let k = 0; k <= n; k++) {
        const x = xa + 0.22 + ((w - 0.44) * k) / n;
        B.box('steel', x - 0.03, 0.45, zr - 0.02, x + 0.03, doorTop, zr + 0.05, { color: 0x2a2c2e, collide: false });
      }
      B.box('steel', xa + 0.22, doorTop - 0.06, zr - 0.02, xb - 0.22, doorTop, zr + 0.05, { color: 0x2a2c2e, collide: false });
    }
    // 간판
    B.box('matte', xa + 0.2, sy0 - 0.03, 0.0, xb - 0.2, sy1 + 0.03, 0.2, { color: 0x121212, collide: false });
    B.sign(state, cells.h[sIdx], xa + 0.25, 0.205, xb - 0.25, 0.205, sy0, sy1);
    if (kind === 'shutter' && !def && rng() < 0.3) {
      const a = xa + 0.3, b = xb - 0.3, c = rng.pick(AWNING);
      B.add('tarp', quadGeo(V(a, 2.2, 1.35), V(b, 2.2, 1.35), V(b, 2.62, 0.21), V(a, 2.62, 0.21), [0, 0, (b - a) / 2, 0, (b - a) / 2, 0.6, 0, 0.6]), c);
      B.add('tarp', quadGeo(V(a, 1.98, 1.35), V(b, 1.98, 1.35), V(b, 2.2, 1.35), V(a, 2.2, 1.35), [0, 0, (b - a) / 2, 0, (b - a) / 2, 0.12, 0, 0.12]), c);
    }
    return { state, sIdx };
  }

  function building(d) {
    const W = d.x1 - d.x0, D = d.depth ?? 14, floors = d.floors ?? 3, gh = d.gh ?? GH;
    const top = gh + (floors - 1) * FH, fac = d.facade ?? 'facade_tile', gmat = d.ground ?? 'concrete';
    const tint = d.tint ?? 0xffffff, gtint = d.gtint ?? (gmat === 'concrete' ? 0x8f8c85 : 0xffffff), pass = d.passage;
    if (d.side === 'N') B.push(d.x0, 0, -SZ, 0); else B.push(d.x1, 0, SZ, Math.PI);

    // 위층 외벽(창문 칸이 벽 길이에 맞도록 U를 맞춘다)
    const uo = rng.int(0, 3) * 0.25, vo = rng.int(0, 3) * 0.25, vr = [vo, vo + (top - gh) / 12];
    const bays = (len) => Math.max(1, Math.round(len / 3)) / 4;
    B.wall(fac, 0, 0, W, 0, gh, top, { u: [uo, uo + bays(W)], v: vr, color: tint });
    B.wall(fac, W, 0, W, -D, gh, top, { u: [uo + 0.25, uo + 0.25 + bays(D)], v: vr, color: tint });
    B.wall(fac, W, -D, 0, -D, gh, top, { u: [uo + 0.5, uo + 0.5 + bays(W)], v: vr, color: tint });
    B.wall(fac, 0, -D, 0, 0, gh, top, { u: [uo + 0.75, uo + 0.75 + bays(D)], v: vr, color: tint });
    B.floor('concrete', 0, -D, W, 0, top, { color: 0x4a4946 });
    const pc = 0x7d7a74;
    B.box('concrete', 0, top, -0.22, W, top + 0.8, 0, { collide: false, color: pc });
    B.box('concrete', 0, top, -D, W, top + 0.8, -D + 0.22, { collide: false, color: pc });
    B.box('concrete', 0, top, -D + 0.22, 0.22, top + 0.8, -0.22, { collide: false, color: pc });
    B.box('concrete', W - 0.22, top, -D + 0.22, W, top + 0.8, -0.22, { collide: false, color: pc });

    // 1층 옆·뒷벽
    B.wall(gmat, W, 0, W, -D, 0, gh, { color: gtint });
    B.wall(gmat, 0, -D, 0, 0, 0, gh, { color: gtint });
    if (pass) {
      B.wall(gmat, W, -D, pass[1], -D, 0, gh, { color: gtint });
      B.wall(gmat, pass[0], -D, 0, -D, 0, gh, { color: gtint });
      B.wall(gmat, pass[0], 0, pass[0], -D, 0, gh, { color: 0x7a7872 });
      B.wall(gmat, pass[1], -D, pass[1], 0, 0, gh, { color: 0x7a7872 });
      B.floor('concrete', pass[0], -D, pass[1], 0, gh, { up: false, color: 0x5a5854 });
    } else {
      B.wall(gmat, W, -D, 0, -D, 0, gh, { color: gtint });
    }

    // 전면 상점
    const segs = pass ? [[0, pass[0]], [pass[1], W]] : [[0, W]];
    let shopIndex = 0;
    const worldShops = [];
    for (const [a, b] of segs) {
      if (d.shops === false) { B.wall(gmat, a, 0, b, 0, 0, gh, { color: gtint }); continue; }
      B.floor(gmat, a, -0.22, b, 0, gh, { up: false, color: gtint });      // 들어간 전면의 천장
      const n = Math.max(1, Math.round((b - a) / 5)), sw = (b - a) / n;
      for (let i = 0; i < n; i++) {
        const def = d.shopDefs ? d.shopDefs[shopIndex] : null;
        const r = shop(a + i * sw, a + (i + 1) * sw, d, def, gmat, gtint);
        worldShops.push({ ...r, center: B.toWorld(a + (i + 0.5) * sw, 2.3, 1.6), def });
        shopIndex++;
      }
      for (let i = 0; i <= n; i++) {
        const x = a + i * sw;
        B.box(gmat, Math.max(a, x - 0.22), 0, -0.3, Math.min(b, x + 0.22), gh, 0.05, { color: gtint, collide: false });
      }
    }

    if (d.shops !== false) {
      // 2층 창 밑 가로 간판
      const nUp = rng.int(0, floors >= 3 ? 2 : 1);
      for (let k = 0; k < nUp; k++) {
        const w = rng.range(3.2, 4.4), xa = rng.range(0.6, Math.max(0.7, W - w - 0.6)), h = w / 4.4, y0 = gh + 0.07;
        if (pass && xa < pass[1] && xa + w > pass[0]) continue;
        B.box('matte', xa - 0.04, y0 - 0.03, 0, xa + w + 0.04, y0 + h + 0.03, 0.1, { color: 0x121212, collide: false });
        B.sign(signState(), cells.h[nextH()], xa, 0.105, xa + w, 0.105, y0, y0 + h);
      }
      // 돌출 세로 간판
      const nv = rng.int(0, 2);
      for (let k = 0; k < nv; k++) {
        const xs = k === 0 ? 0.6 : W - 0.6, y0 = gh + 0.4 + (floors >= 4 ? rng.int(0, 1) * FH : 0), h = 3.0, w = 0.75;
        const c = cells.v[nextV()], st = signState();
        B.box('matte', xs - 0.08, y0 - 0.04, 0.1, xs + 0.08, y0 + h + 0.04, 0.2 + w, { color: 0x121212, collide: false });
        B.sign(st, c, xs + 0.085, 0.14 + w, xs + 0.085, 0.14, y0, y0 + h);
        B.sign(st, c, xs - 0.085, 0.14, xs - 0.085, 0.14 + w, y0, y0 + h);
      }
    }

    // 옥상
    const kit = d.roof ?? rng.pick(['tank', 'tank', 'ac', 'bulk']);
    if (kit === 'tank') P.waterTank(B, rng.range(1.6, W - 1.6), top, -rng.range(2.2, D - 2.2), rng.pick([0xd3b22a, 0x2a62b8, 0xd3b22a]));
    if (kit === 'bulk') B.box('concrete', W * 0.5 - 1.6, top, -D + 1, W * 0.5 + 1.6, top + 2.5, -D + 4.4, { color: gtint, collide: false });
    for (let k = rng.int(0, 2); k > 0; k--) {
      const ax = rng.range(1, W - 2), az = -rng.range(1, D - 2);
      B.box('matte', ax, top, az, ax + 0.9, top + 0.72, az + 0.36, { color: 0xb9bbb6, collide: false });
    }
    if (d.cross) {
      // 교회 첨탑의 붉은 네온 십자가
      const cx = W * 0.5, cz = -2.2, base = top;
      for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
        B.box('steel', cx + dx - 0.035, base, cz + dz - 0.035, cx + dx + 0.035, base + 3.7, cz + dz + 0.035, { color: 0x4a4d50, collide: false, rz: dx * 0.22, rx: -dz * 0.22 });
      }
      for (const y of [1.2, 2.4]) B.box('steel', cx - 0.32, base + y, cz - 0.32, cx + 0.32, base + y + 0.05, cz + 0.32, { color: 0x4a4d50, collide: false });
      const red = mats.emissive(0xff2418, 4);
      B.box(red, cx - 0.07, base + 3.6, cz - 0.07, cx + 0.07, base + 6.0, cz + 0.07, { collide: false });
      B.box(red, cx - 0.7, base + 5.0, cz - 0.07, cx + 0.7, base + 5.14, cz + 0.07, { collide: false });
    }

    if (d.arcade) {
      // 시장 아케이드: 입구 간판, 안쪽 점포 셔터, 좌판, 천장 형광등
      const [p0, p1] = pass;
      const aw = p1 - p0 - 0.5, ah = aw / 4.4;
      B.box('matte', p0 + 0.2, gh - ah - 0.12, 0, p1 - 0.2, gh - 0.04, 0.22, { color: 0x121212, collide: false });
      B.sign('lit', cells.h[SIGN['의정부 새벽시장']], p0 + 0.25, 0.225, p1 - 0.25, 0.225, gh - ah - 0.08, gh - 0.08);
      B.sign('off', cells.h[SIGN['의정부 새벽시장']], p1 - 0.25, -D - 0.02, p0 + 0.25, -D - 0.02, gh - ah - 0.08, gh - 0.08);
      for (let k = 0; k < 3; k++) {
        const za = -1.2 - k * 4.2, zb = za - 3.6;
        B.wall('shutter', p0 + 0.02, za, p0 + 0.02, zb, 0.03, 2.6, { u: [0, 1], v: [0, 1], color: rng.pick([0xc9ccce, 0xa9b2a6, 0x9aa3ad]) });
        B.wall('shutter', p1 - 0.02, zb, p1 - 0.02, za, 0.03, 2.6, { u: [0, 1], v: [0, 1], color: rng.pick([0xc9ccce, 0xb8b0a0, 0x9aa3ad]) });
      }
      const stall = (x, z, w, dd) => {
        B.box('wood', x - w / 2, 0, z - dd / 2, x + w / 2, 0.78, z + dd / 2, { surface: 'wood', color: 0xb0a898 });
        for (let k = 0; k < 3; k++) {
          const s = rng.range(0.36, 0.5), cx = x + rng.range(-w / 2 + 0.3, w / 2 - 0.3), cz = z + rng.range(-dd / 2 + 0.3, dd / 2 - 0.3);
          B.box(rng() < 0.5 ? 'wood' : 'matte', cx - s / 2, 0.78, cz - s / 2, cx + s / 2, 0.78 + s * 0.7, cz + s / 2,
            { color: rng.pick([0xffffff, 0xc23a2a, 0x2a5fb0, 0xd9b21c, 0xe8e8e0]), collide: false, ry: rng.range(-0.3, 0.3) });
        }
      };
      stall(p0 + 0.75, -3.2, 1.1, 2.6); stall(p1 - 0.75, -6.4, 1.1, 2.8); stall(p0 + 0.75, -10.4, 1.1, 2.6); stall(p1 - 0.75, -12.2, 1.1, 2.2);
      const tube = mats.emissive(0xcfe6ff, 5), dead = mats.get('matte');
      [-3.5, -7, -10.5].forEach((tz, k) => {
        B.box('matte', (p0 + p1) / 2 - 0.75, gh - 0.1, tz - 0.09, (p0 + p1) / 2 + 0.75, gh - 0.02, tz + 0.09, { color: 0x8a8d8f, collide: false });
        B.box(k === 1 ? dead : tube, (p0 + p1) / 2 - 0.7, gh - 0.14, tz - 0.03, (p0 + p1) / 2 + 0.7, gh - 0.1, tz + 0.03, { color: 0x5a5d5f, collide: false });
      });
    }

    const co = { surface: 'concrete', tag: 'building' };
    if (pass) {
      B.collide(0, 0, -D, pass[0], top + 0.8, 0, co); B.collide(pass[1], 0, -D, W, top + 0.8, 0, co); B.collide(pass[0], gh, -D, pass[1], top + 0.8, 0, co);
    } else {
      B.collide(0, 0, -D, W, top + 0.8, 0, co);
    }
    B.pop();
    return worldShops;
  }

  // 상점 없는 덩어리 건물(공터를 둘러싸는 뒷건물, 먼 아파트)
  function block(x0, z0, x1, z1, floors, fac = 'facade_plaster', tint = 0xffffff) {
    const top = floors * FH, W = x1 - x0, D = z1 - z0;
    const uo = rng.int(0, 3) * 0.25, vo = rng.int(0, 3) * 0.25, vr = [vo, vo + top / 12];
    const bays = (len) => Math.max(1, Math.round(len / 3)) / 4;
    B.wall(fac, x0, z1, x1, z1, 0, top, { u: [uo, uo + bays(W)], v: vr, color: tint });
    B.wall(fac, x1, z1, x1, z0, 0, top, { u: [uo, uo + bays(D)], v: vr, color: tint });
    B.wall(fac, x1, z0, x0, z0, 0, top, { u: [uo, uo + bays(W)], v: vr, color: tint });
    B.wall(fac, x0, z0, x0, z1, 0, top, { u: [uo, uo + bays(D)], v: vr, color: tint });
    B.floor('concrete', x0, z0, x1, z1, top, { color: 0x4a4946 });
    B.collide(x0, 0, z0, x1, top, z1, { surface: 'concrete', tag: 'building' });
  }

  const storeShops = [];
  const NORTH = [
    { x0: -62, x1: -46, floors: 5, facade: 'facade_plaster', tint: 0xc9c6bc },
    { x0: -46, x1: -36, floors: 3, facade: 'facade_brick', ground: 'brick', shopDefs: { 0: { sign: SIGN['원조 부대찌개'], state: 'lit' } } },
    { x0: -36, x1: -24, floors: 4, facade: 'facade_tile', cross: true, roof: 'none', shopDefs: { 1: { sign: SIGN['금성 노래연습장'], state: 'flicker' } } },
    { x0: -20, x1: -8, floors: 3, facade: 'facade_tile', tint: 0xe6efe0, shopDefs: { 0: { sign: SIGN['새벽약국'], state: 'lit', kind: 'glass' } } },
    { x0: -8, x1: 6, floors: 4, facade: 'facade_plaster', gh: 4.2, passage: [4, 10], arcade: true },
    { x0: 6, x1: 20, floors: 5, facade: 'facade_brick', ground: 'brick' },
    { x0: 20, x1: 34, floors: 3, facade: 'facade_tile', tint: 0xf0dcd2, shopDefs: { 1: { sign: SIGN['스타 PC방'], state: 'lit' } } },
    { x0: 34, x1: 48, floors: 4, facade: 'facade_plaster', tint: 0xa9b2bc },
    { x0: 48, x1: 62, floors: 3, facade: 'facade_tile' },
  ];
  const SOUTH = [
    { x0: -62, x1: -56, floors: 3, facade: 'facade_brick', ground: 'brick' },
    { x0: -52, x1: -38, floors: 4, facade: 'facade_tile', tint: 0xdfe6ee },
    { x0: -38, x1: -26, floors: 3, facade: 'facade_plaster', shopDefs: { 0: { sign: SIGN['엄마손 분식'], state: 'lit' } } },
    { x0: -26, x1: -12, floors: 5, facade: 'facade_tile', shopDefs: { 1: { sign: SIGN['다온 편의점'], state: 'lit', kind: 'glass', store: true } } },
    { x0: -12, x1: 2, floors: 3, facade: 'facade_brick', ground: 'brick' },
    { x0: 2, x1: 14, floors: 4, facade: 'facade_plaster', tint: 0xd8cfc0, shopDefs: { 0: { sign: SIGN['황금치킨 호프'], state: 'flicker' } } },
    { x0: 18, x1: 32, floors: 3, facade: 'facade_tile', tint: 0xe8f0e0 },
    { x0: 32, x1: 46, floors: 5, facade: 'facade_brick', ground: 'brick', shopDefs: { 2: { sign: SIGN['회룡 모텔'], state: 'lit' } } },
    { x0: 50, x1: 62, floors: 4, facade: 'facade_tile' },
  ];
  for (const d of NORTH) building({ ...d, side: 'N' });
  for (const d of SOUTH) for (const s of building({ ...d, side: 'S' })) if (s.def?.store) storeShops.push(s);

  // 공터를 둘러싸는 뒷건물과 거리 끝 건물
  block(-62, -40, -40, -21, 4, 'facade_tile');
  block(12, -40, 36, -21, 5, 'facade_brick');
  block(36, -40, 62, -21, 3, 'facade_plaster', 0xc9c6bc);
  block(-62, -52, -30, -40, 6, 'facade_plaster');
  block(-30, -52, -4, -40, 4, 'facade_tile', 0xe6efe0);
  block(-4, -52, 22, -40, 7, 'facade_brick');
  block(22, -52, 62, -40, 5, 'facade_tile');
  block(-62, 21, -30, 40, 4, 'facade_plaster', 0xd8cfc0);
  block(-30, 21, 2, 40, 5, 'facade_brick');
  block(-62, 40, -20, 52, 5, 'facade_tile');
  block(-20, 40, 14, 52, 6, 'facade_plaster', 0xa9b2bc);
  block(14, 40, 40, 52, 4, 'facade_brick');
  block(40, 40, 62, 52, 7, 'facade_tile', 0xdfe6ee);
  block(62, -21, 74, 21, 6, 'facade_tile');
  block(-74, -21, -62, 21, 5, 'facade_plaster');
  block(62, 21, 74, 52, 4, 'facade_brick');
  // 안개 너머 아파트 단지
  block(-52, -72, -22, -58, 16, 'facade_plaster', 0xb8bcc0);
  block(-2, -76, 30, -62, 19, 'facade_plaster', 0xc4c0b6);
  block(40, -70, 66, -58, 14, 'facade_plaster', 0xb0b6ba);
  block(-34, 58, -2, 72, 17, 'facade_plaster', 0xbcb8ae);
  block(20, 60, 52, 74, 15, 'facade_plaster', 0xb4b8bc);

  // =====================================================================  거리 소품
  // 출발 골목(아군 방어선 쪽)
  P.sandbags(B, -56, 18.2, -52, 18.2, 8, { rng, thick: 2 });
  B.collide(-56, 0, 18, -52, 6, 18.6, { bodyOnly: true });
  B.box('matte', -55.2, 1.75, 17.75, -52.8, 2.4, 17.8, { color: 0x121212, collide: false });
  B.sign('off', cells.h[SIGN['군 작전 지역']], -55.15, 17.74, -52.85, 17.74, 1.8, 2.35);
  P.crate(B, -55.1, 0, 12.2, 0.9, 0.42, 0.5, { mat: 'matte', color: 0x46523a, surface: 'metal' });
  P.crate(B, -55.1, 0.42, 12.25, 0.9, 0.42, 0.5, { mat: 'matte', color: 0x3d4630, surface: 'metal' });
  P.barrel(B, -52.6, 10.6, 0x4a5238);
  P.sandbags(B, -56.8, 8.6, -54.4, 8.6, 4, { rng });

  // 거리 서쪽 끝 차단(컨테이너)
  P.container(B, -58.6, -3.1, Math.PI / 2, 0x7a2f22);
  P.container(B, -58.9, 3.2, Math.PI / 2, 0x22486f);
  P.container(B, -58.7, 0.4, Math.PI / 2 + 0.12, 0x5a5f52, 2.59);
  P.razorWire(B, -57.2, -6.6, -57.2, 6.6);
  B.collide(-60.5, 0, -7, -59.8, 9, 7, { bodyOnly: true });

  // 서쪽 구간
  P.car(B, -45.5, -2.75, 0.03, { color: P.CAR_COLORS[0] });
  P.jersey(B, -40.5, 1.2, 0.1, { stripe: true }); P.jersey(B, -38.2, -1.3, -0.08);
  const pojang = P.pojangmacha(B, -32.5, 5.5, Math.PI, { y: 0.15 });
  P.truck1t(B, -27, 2.75, Math.PI + 0.04);
  P.cone(B, -24.4, 0.6); P.cone(B, -23.2, -1.9); P.cone(B, -19.6, 1.4);
  P.car(B, -14.5, -0.3, 0.52, { type: 'taxi', color: 0x9a9fa4 });
  P.sandbags(B, -9.5, 0.8, -9.5, 3.5, 5, { rng, thick: 2 });
  P.sandbags(B, -9.2, -3.4, -9.2, -1.2, 4, { rng });
  B.box('steel', -9.9, 0, 3.75, -9.84, 2.3, 3.81, { color: 0x4a4d50, collide: false });
  B.box('matte', -10.0, 1.5, 3.78, -9.0, 2.3, 3.84, { color: 0x121212, collide: false });
  B.sign('off', cells.h[SIGN['검문소']], -10.95, 3.77, -8.75, 3.77, 1.72, 2.22);
  P.vending(B, -17.5, -6.55, 0, { y: 0.15 });
  P.vending(B, 8.6, 6.55, Math.PI, { y: 0.15, color: 0x1f4fa0, glow: 0xffe9c4 });
  // 가운데: 불탄 버스
  P.bus(B, 9.5, -1.9, 0.07, { burnt: true });
  P.rubble(B, 3.5, -1.2, 2.2, 22, rng);
  P.car(B, 22.5, 2.7, Math.PI - 0.05, { type: 'suv', color: P.CAR_COLORS[6] });
  P.jersey(B, 27.5, -1.5, 0.05); P.jersey(B, 29.8, 1.4, -0.06, { stripe: true }); P.jersey(B, 27.4, 3.0, 0.02);
  P.crate(B, 33.2, 0.15, -5.4, 1.1, 1.0, 1.1); P.crate(B, 33.3, 1.15, -5.45, 0.9, 0.8, 0.9, { ry: 0.3 }); P.crate(B, 34.5, 0.15, -5.6, 1.0, 0.9, 1.0);
  P.barrel(B, 31.8, -5.9, 0x7a2f22, 0.15); P.barrel(B, 31.1, -5.6, 0x2a4f8a, 0.15);
  // 동쪽: 교란기 C 진지
  P.sandbags(B, 37.4, -3.2, 37.4, -0.6, 5, { rng, thick: 2 });
  P.sandbags(B, 37.4, 1.2, 37.4, 3.4, 5, { rng, thick: 2 });
  P.sandbags(B, 38.6, -3.4, 43.4, -3.4, 4, { rng });
  P.hedgehog(B, 46.2, -2.2, 0.4); P.hedgehog(B, 47.4, 1.6, 1.3);
  P.car(B, 51.4, -2.5, 0.2, { burnt: true });
  emitters.push({ type: 'fire', pos: V(51.2, 1.0, -2.5) });
  P.rubble(B, 50.5, 0.4, 2.4, 18, rng);
  // 동쪽 끝 차단
  P.container(B, 58.7, -2.9, Math.PI / 2 - 0.06, 0x2c5a3a);
  P.container(B, 58.9, 3.3, Math.PI / 2, 0x7a2f22);
  P.razorWire(B, 57.0, -6.6, 57.0, 6.6);
  B.collide(59.8, 0, -7, 60.5, 9, 7, { bodyOnly: true });

  // 북쪽 공터(교란기 A)
  P.car(B, -35.2, -37, Math.PI / 2, { color: P.CAR_COLORS[1] });
  P.car(B, -30, -36.9, Math.PI / 2 + 0.04, { type: 'suv', color: P.CAR_COLORS[2] });
  P.truck1t(B, -3.5, -36.6, 0.02, { color: 0xd8d8d2, cargo: false });
  P.container(B, 6.2, -31.5, Math.PI / 2, 0x7a2f22);
  P.container(B, -36.6, -27.2, 0, 0x22486f);
  P.dumpster(B, -18.6, -22.4, 0);
  P.sandbags(B, -17.6, -27.6, -10.4, -27.6, 4, { rng });
  P.sandbags(B, -17.8, -31.4, -17.8, -27.9, 4, { rng });
  P.crate(B, -8.6, 0, -23.2, 1.1, 1.0, 1.1); P.crate(B, -7.3, 0, -23.4, 1.0, 0.9, 1.0, { ry: 0.2 }); P.crate(B, -8.1, 1.0, -23.3, 0.9, 0.8, 0.9, { ry: -0.25 });
  P.barrel(B, -24.6, -33.4, 0x7a2f22); P.barrel(B, -25.3, -33.9, 0x4a5238); P.barrel(B, -24.5, -34.4, 0x2a4f8a);
  P.jersey(B, -24, -24.6, Math.PI / 2); P.jersey(B, -4.6, -29.5, 0.3);
  B.box('wood', 9.6, 0, -24.4, 10.8, 0.14, -23.2, { color: 0xb0a898, surface: 'wood', navFree: true });
  B.box('wood', 9.6, 0.14, -24.4, 10.8, 0.28, -23.2, { color: 0xa09888, surface: 'wood', navFree: true, ry: 0.1 });

  // 남쪽 마당(교란기 B)
  P.swingSet(B, 9.5, 34.5, 0.1);
  P.truck1t(B, 20.5, 24.3, Math.PI - 0.03, { color: 0x1c56a8 });
  P.car(B, 38.4, 37, Math.PI / 2, { color: P.CAR_COLORS[3] });
  P.car(B, 43.6, 36.8, Math.PI / 2 - 0.03, { color: P.CAR_COLORS[5] });
  P.dumpster(B, 4.2, 37.6, 0.05, 0x2c5a3a); P.dumpster(B, 6.3, 37.7, -0.04, 0x2a4f8a);
  P.sandbags(B, 22.6, 26.8, 29.4, 26.8, 4, { rng });
  P.sandbags(B, 29.8, 27.1, 29.8, 30.6, 4, { rng });
  B.box('concrete', 2.4, 0, 28.0, 3.0, 0.45, 32.0, { color: 0x9a978f, surface: 'concrete' });        // 벤치
  B.box('wood', 2.3, 0.45, 27.9, 3.1, 0.52, 32.1, { color: 0xb0a898, surface: 'wood', collide: false });
  P.crate(B, 34.5, 0, 24.2, 1.1, 1.0, 1.1); P.crate(B, 35.8, 0, 24.5, 1.0, 0.8, 1.0, { ry: 0.4 });
  P.barrel(B, 12.4, 22.2, 0x4a5238); P.barrel(B, 13.1, 22.5, 0x7a2f22);
  P.jersey(B, 16, 28.5, Math.PI / 2 + 0.1);
  // 마당과 회수 지점 사이 담
  B.box('brick', 45.8, 0, 21, 46.2, 2.3, 24.2, { surface: 'concrete' });
  B.box('brick', 45.8, 0, 29.2, 46.2, 2.3, 40, { surface: 'concrete' });
  // 회수 지점
  P.apc(B, 55.2, 35.6, Math.PI);
  P.crate(B, 49, 0, 37.5, 0.9, 0.42, 0.5, { mat: 'matte', color: 0x46523a, surface: 'metal' });
  P.crate(B, 50.2, 0, 37.7, 0.9, 0.42, 0.5, { mat: 'matte', color: 0x3d4630, surface: 'metal', ry: 0.2 });
  P.sandbags(B, 58.6, 22.4, 61.6, 22.4, 5, { rng });

  // 골목 소품
  P.dumpster(B, -22.9, -12, Math.PI / 2, 0x2a4f8a);
  P.crate(B, -20.8, 0, -16.5, 0.8, 0.7, 0.8, { ry: 0.2 });
  P.barrel(B, 14.6, 12.4, 0x2a4f8a); P.crate(B, 17.3, 0, 16.2, 0.9, 0.8, 0.9);
  P.dumpster(B, 49.1, 13.5, Math.PI / 2);

  // =====================================================================  전봇대와 전선, 가로등
  const poles = [-50, -26, -2, 22, 46].map((x) => P.utilityPole(B, x, -4.42, { transformer: x !== -2 }));
  for (let i = 0; i < poles.length - 1; i++) {
    for (let k = 0; k < 6; k++) { if (k === 4) continue; P.wire(B, poles[i][k], poles[i + 1][k], 0.5 + rng() * 0.5); }
  }
  for (const arms of poles) {
    // 건물로 내려가는 인입선, 길 건너가는 선
    P.wire(B, arms[3], V(arms[3].x + rng.range(-5, 5), rng.range(5.5, 8.5), -SZ), 0.4, 0.012);
    P.wire(B, arms[5], V(arms[5].x + rng.range(-6, 6), rng.range(5.5, 9), SZ), 0.9, 0.012);
    if (rng() < 0.7) P.wire(B, arms[4], V(arms[4].x + rng.range(-8, 8), rng.range(4.2, 7), SZ), 1.2, 0.012);
  }
  const lampA = P.streetLamp(B, -44, -4.6, 1, true), lampB = P.streetLamp(B, 30, -4.6, 1, true);
  P.streetLamp(B, -8, 4.6, -1, false); P.streetLamp(B, 52, 4.6, -1, false);
  const warm = [1.0, 0.70, 0.40];
  for (const p of [lampA, lampB]) { addLight(V(p.x, p.y - 0.4, p.z), warm, 85, 30, 'lamp'); lightCone(p, [0.03, 0.02, 0.011]); }

  // 아케이드 형광등, 편의점, 포장마차, 화재
  addLight(V(-1, 3.75, -14), [0.74, 0.88, 1.0], 20, 15, 'tube');
  for (const s of storeShops) addLight(s.center, [0.80, 1.0, 0.88], 34, 17, 'store');
  addLight(V(pojang.x, pojang.y, pojang.z), [1.0, 0.68, 0.36], 12, 9, 'bulb');
  addLight(V(51.2, 1.5, -2.5), [1.0, 0.42, 0.10], 46, 20, 'fire');
  interiorBoxes.push(new THREE.Box3(V(-4, 0, -21), V(2, 4.2, -7)));

  // =====================================================================  교란기(동적 물체)
  function makeJammer(id, label, x, z, yaw) {
    const group = new THREE.Group();
    group.name = 'jammer_' + id;
    group.position.set(x, 0, z); group.rotation.y = yaw;
    const olive = 0x3e4932, dark = 0x22271c;
    const matte = [], steel = [], rubber = [];
    const bx = (list, w, h, d, px, py, pz, color, rot) => { const g = boxGeo(w, h, d, 1.5); if (rot) g.rotateY(rot); g.translate(px, py, pz); list.push({ geo: g, color }); };
    const cy = (list, r, h, px, py, pz, color, seg = 10, rTop) => { const g = new THREE.CylinderGeometry(rTop ?? r, r, h, seg); g.translate(px, py + h / 2, pz); list.push({ geo: g, color }); };
    bx(matte, 2.5, 0.16, 1.5, 0, 0.62, 0, dark);
    bx(matte, 1.0, 0.95, 1.3, -0.68, 1.18, 0, olive);
    bx(matte, 1.15, 1.25, 1.3, 0.6, 1.33, 0, 0x46523a);
    bx(matte, 0.56, 0.46, 0.04, 0.6, 1.5, 0.67, 0x0e110d);
    bx(matte, 0.3, 0.5, 0.3, -0.68, 1.9, 0.2, 0x2a2e26);
    bx(steel, 1.0, 0.06, 0.06, -1.72, 0.6, 0, 0x55585a);
    for (const sx of [-1.15, 1.15]) for (const sz of [-0.7, 0.7]) bx(steel, 0.07, 0.62, 0.07, sx, 0.31, sz, 0x55585a);
    cy(steel, 0.075, 4.9, 0, 0.7, 0, 0x6a6e70, 10, 0.05);
    cy(steel, 0.012, 1.4, 0, 5.6, 0, 0x2a2c2e, 5);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; bx(matte, 0.44, 1.25, 0.07, Math.sin(a) * 0.36, 4.6, Math.cos(a) * 0.36, 0x8a8f86, a); }
    for (const sz of [-0.82, 0.82]) { const g = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12); g.rotateX(Math.PI / 2); g.translate(0.1, 0.34, sz); rubber.push({ geo: g, color: 0x1a1a1c }); }
    for (const [list, name] of [[matte, 'matte'], [steel, 'steel'], [rubber, 'rubber']]) {
      const m = new THREE.Mesh(mergeParts(list), mats.get(name));
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), beaconMat);
    beacon.position.set(0, 5.68, 0);
    const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.35, 1.5, 0.5) });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), screenMat);
    screen.position.set(0.6, 1.5, 0.695);
    group.add(beacon, screen);
    root.add(group);
    group.updateMatrixWorld(true);

    B.push(x, 0, z, yaw);
    const boxes = [B.collide(-1.3, 0, -0.8, 1.3, 2.0, 0.8, { surface: 'metal', tag: 'jammer' }), B.collide(-0.1, 2.0, -0.1, 0.1, 5.6, 0.1, { surface: 'metal' })];
    const interactPos = B.toWorld(0.6, 1.4, 1.35), lightPos = B.toWorld(0.2, 2.9, 1.3), sparkPos = B.toWorld(0.6, 1.6, 0.7);
    B.pop();
    const light = addLight(lightPos, [1.0, 0.16, 0.08], 0, 16, 'jammer');
    const jam = {
      id, label, group, boxes, light, interactPos, sparkPos,
      pos: V(x, 1.3, z), top: V(x, 5.7, z), active: true, t: rng() * 6,
      cut() {
        jam.active = false;
        beaconMat.color.setRGB(0.03, 0.0, 0.0); screenMat.color.setRGB(0.02, 0.03, 0.02); light.intensity = 0;
      },
      reset() { jam.active = true; screenMat.color.setRGB(0.35, 1.5, 0.5); },
      update(dt) {
        if (!jam.active) return;
        jam.t += dt;
        const k = Math.pow(Math.max(0, Math.sin(jam.t * 3.4)), 6);
        beaconMat.color.setRGB(0.25 + k * 4.2, 0.02 + k * 0.3, 0.02);
        light.intensity = 3 + k * 26;
      },
    };
    return jam;
  }
  const objectives = [
    makeJammer('A', 'A', -14, -31, 0),
    makeJammer('B', 'B', 26, 30, Math.PI),
    makeJammer('C', 'C', 41, -0.6, -Math.PI / 2),
  ];

  // 회수 지점
  const exLight = addLight(V(51.5, 1.2, 30), [0.2, 1.0, 0.3], 0, 16, 'extract');
  const extraction = {
    pos: V(51.5, 0, 30), radius: 3.4, active: false, light: exLight,
    activate(on) { extraction.active = on; exLight.userData.base = on ? 22 : 0; exLight.intensity = on ? 22 : 0; },
  };

  // =====================================================================  마무리
  const meshes = B.finish(root);
  if (G.render.reflection) for (const m of meshes) if (m.material.userData.reflective) G.render.reflection.hidden.push(m);
  if (coneGeos.length) {
    const g = coneGeos.length > 1 ? mergeGeometries(coneGeos, false) : coneGeos[0];
    const cone = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    cone.name = 'lamp_cones'; cone.renderOrder = 5;
    root.add(cone);
  }
  physics.build();

  // 적 초기 배치와 증원 진입점
  const guards = [
    { type: 'jackal', pos: [-18, 0, 1.6], patrol: [[-34, 0, 1.8], [-4, 0, -2.2]] },
    { type: 'drone', pos: [-12, 5, 0], patrol: [[-36, 5, -0.5], [2, 5.4, 1]] },
    { type: 'jackal', pos: [-9, 0, -30.5], patrol: [[-30, 0, -31], [0, 0, -25.5]], zone: 'A' },
    { type: 'drone', pos: [-20, 5, -30], patrol: [[-33, 5, -31], [2, 5, -33]], zone: 'A' },
    { type: 'jackal', pos: [21, 0, 32.5], patrol: [[8, 0, 27], [38, 0, 32]], zone: 'B' },
    { type: 'jackal', pos: [33, 0, 28], patrol: [[36, 0, 25.5], [14, 0, 36]], zone: 'B' },
    { type: 'drone', pos: [24, 5, 31], patrol: [[8, 5, 30], [40, 5.5, 33]], zone: 'B' },
    { type: 'jackal', pos: [34, 0, 1.5], patrol: [[24, 0, -2.4], [48, 0, 2.2]], zone: 'C' },
    { type: 'drone', pos: [42, 5.5, 0.5], patrol: [[30, 5.5, 1], [52, 5, -1]], zone: 'C' },
    { type: 'drone', pos: [20, 6, -1], patrol: [[14, 6, 2], [36, 6, -2]], zone: 'C' },
  ];
  const waveSpawns = {
    drone: [[-30, 20, -30], [10, 22, 30], [0, 20, 0], [44, 21, -30], [-44, 20, 2], [50, 20, 8]],
    jackal: [[-54, 0, -1.5], [54, 0, 1.5], [-38, 0, -37], [9, 0, -38], [4, 0, 24], [43, 0, 27], [-22, 0, -19], [16, 0, 19], [48, 0, 19]],
  };

  const cinematicPath = [
    { pos: [-49, 2.1, 2.2], look: [-20, 3.2, -1] },
    { pos: [-30, 3.6, -1.6], look: [0, 3.4, 1.5] },
    { pos: [-6, 2.4, 2.4], look: [24, 4, -2] },
    { pos: [18, 4.2, -2.2], look: [46, 2.5, 0] },
    { pos: [34, 2.2, 2.6], look: [52, 2.5, -2] },
  ];

  let time = 0;
  return {
    root, objectives, extraction, guards, waveSpawns, interiorBoxes, cinematicPath, emitters, lights,
    bounds: physics.bounds,
    playerStart: { pos: V(-54, 0, 14.6), yaw: 0 },
    groundSurfaceAt: () => 'asphalt',
    isInterior(p) { for (const b of interiorBoxes) if (b.containsPoint(p)) return true; return false; },
    update(dt) {
      time += dt;
      for (const l of lights) {
        const u = l.userData;
        if (u.kind === 'fire') l.intensity = u.base * (0.72 + 0.2 * Math.sin(time * 11 + u.seed) + 0.14 * Math.sin(time * 23.7 + u.seed * 2) + 0.1 * Math.sin(time * 5.3));
        else if (u.kind === 'tube') { const f = Math.sin(time * 31 + u.seed) + Math.sin(time * 13.3) + Math.sin(time * 2.9); l.intensity = f > 2.1 ? u.base * 0.15 : u.base; }
        else if (u.kind === 'extract' && u.base > 0) l.intensity = u.base * (0.8 + 0.2 * Math.sin(time * 9));
      }
      for (const j of objectives) j.update(dt);
    },
  };
}

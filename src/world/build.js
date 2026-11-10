import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 레벨 조립 도구. 같은 재질의 지오메트리를 모아 한 메시로 합치고(드로콜 절약),
// 충돌 박스를 물리 월드에 함께 등록한다. 변환 스택으로 소품을 원하는 위치·방향에 놓는다.

const _c = new THREE.Color();
const KEEP = ['position', 'normal', 'uv', 'color'];

// 정점색을 한 색으로 채운다. vertexColors 재질을 쓰는 지오메트리에는 반드시 필요하다.
export function paintGeo(geo, color = 0xffffff) {
  _c.set(color);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// 실제 치수 기준 UV를 갖는 박스(텍스처 밀도가 일정해진다)
export function boxGeo(w, h, d, tile = 1, uo = 0, vo = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile + uo, (uv.getY(i) * dims[f][1]) / tile + vo);
  }
  return g;
}

// 네 점 a→b→c→d(바깥에서 볼 때 반시계)로 사각형을 만든다.
export function quadGeo(a, b, c, d, uv = [0, 0, 1, 0, 1, 1, 0, 1]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]), 2));
  g.computeVertexNormals();
  return g;
}

// 병합용으로 속성을 통일한다(비인덱스, position/normal/uv/color).
export function normalizeGeo(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (color !== undefined || !g.attributes.color) paintGeo(g, color ?? 0xffffff);
  return g;
}

// 여러 조각을 한 지오메트리로 합친다(적·총기 등 동적 물체용). parts: [{ geo, color, matrix }]
export function mergeParts(parts) {
  const list = parts.map((p) => { const g = normalizeGeo(p.geo, p.color); if (p.matrix) g.applyMatrix4(p.matrix); return g; });
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createBuilder(G) {
  const physics = G.physics, rng = G.rng;
  const buckets = new Map();
  const stack = [new THREE.Matrix4()];
  const cur = () => stack[stack.length - 1];
  const corner = new THREE.Vector3(), mn = new THREE.Vector3(), mx = new THREE.Vector3();
  const mat = (m) => (typeof m === 'string' ? G.mats.get(m) : m);

  const B = {
    G,
    // 변환 스택: 이후 추가되는 모든 것이 (x,y,z) 이동 + Y축 회전을 따른다.
    push(x = 0, y = 0, z = 0, ry = 0) {
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
      stack.push(cur().clone().multiply(m));
      return B;
    },
    pop() { if (stack.length > 1) stack.pop(); return B; },
    toWorld(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(cur()); },
    yaw() { const e = cur().elements; return Math.atan2(e[8], e[0]); },

    add(material, geo, color) {
      const m = mat(material);
      const g = normalizeGeo(geo, color);
      g.applyMatrix4(cur());
      let b = buckets.get(m);
      if (!b) buckets.set(m, b = []);
      b.push(g);
      return B;
    },

    // 지역 좌표 박스를 월드 AABB로 바꿔 충돌 등록
    collide(x0, y0, z0, x1, y1, z1, o = {}) {
      mn.set(Infinity, Infinity, Infinity); mx.set(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0).applyMatrix4(cur());
        mn.min(corner); mx.max(corner);
      }
      return physics.addBox(mn, mx, o);
    },

    box(material, x0, y0, z0, x1, y1, z1, o = {}) {
      const m = mat(material);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
      const g = boxGeo(w, h, d, o.tile ?? m.userData.tile ?? 1, o.uo ?? rng(), o.vo ?? rng());
      if (o.rx) g.rotateX(o.rx);
      if (o.ry) g.rotateY(o.ry);
      if (o.rz) g.rotateZ(o.rz);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      B.add(m, g, o.color);
      if (o.collide !== false) B.collide(x0, y0, z0, x1, y1, z1, { surface: o.surface, navFree: o.navFree, shotsOnly: o.shotsOnly, tag: o.tag });
      return B;
    },

    // 기둥·통. (x,y,z)는 밑면 중심. axis: 'y'(기본) | 'x' | 'z'
    cyl(material, x, y, z, r, h, o = {}) {
      const m = mat(material), tile = o.tile ?? m.userData.tile ?? 1;
      const g = new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg ?? 12, 1, !!o.open);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / tile, (uv.getY(i) * h) / tile);
      g.translate(0, h / 2, 0);
      if (o.axis === 'x') g.rotateZ(-Math.PI / 2);
      else if (o.axis === 'z') g.rotateX(Math.PI / 2);
      g.translate(x, y, z);
      B.add(m, g, o.color);
      if (o.collide) {
        if (o.axis === 'x') B.collide(x, y - r, z - r, x + h, y + r, z + r, { surface: o.surface });
        else if (o.axis === 'z') B.collide(x - r, y - r, z, x + r, y + r, z + h, { surface: o.surface });
        else B.collide(x - r * 0.8, y, z - r * 0.8, x + r * 0.8, y + h, z + r * 0.8, { surface: o.surface });
      }
      return B;
    },

    // 세로 벽 한 장. (x0,z0)→(x1,z1)로 갈 때 오른쪽이 앞면이다.
    wall(material, x0, z0, x1, z1, y0, y1, o = {}) {
      const m = mat(material), tile = o.tile ?? m.userData.tile ?? 1;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const [u0, u1] = o.u ?? [o.uo ?? 0, (o.uo ?? 0) + len / tile];
      const [v0, v1] = o.v ?? [(y0 - (o.vBase ?? 0)) / tile, (y1 - (o.vBase ?? 0)) / tile];
      B.add(m, quadGeo(V(x0, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z0), [u0, v0, u1, v0, u1, v1, u0, v1]), o.color);
      return B;
    },

    // 수평 판. up=true면 윗면, false면 아랫면(천장)
    floor(material, x0, z0, x1, z1, y, o = {}) {
      const m = mat(material), tile = o.tile ?? m.userData.tile ?? 1;
      const uo = o.uo ?? rng(), vo = o.vo ?? rng();
      const uv = [uo, vo, uo + (x1 - x0) / tile, vo, uo + (x1 - x0) / tile, vo + (z1 - z0) / tile, uo, vo + (z1 - z0) / tile];
      const g = o.up === false
        ? quadGeo(V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1), uv)
        : quadGeo(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]]);
      B.add(m, g, o.color);
      return B;
    },

    // 위아래 크기가 다른 사다리꼴 상자(차 지붕, 방호벽 등)
    taper(material, bx0, bx1, bz0, bz1, tx0, tx1, tz0, tz1, y0, y1, o = {}) {
      const m = mat(material), tile = o.tile ?? m.userData.tile ?? 1;
      const b00 = V(bx0, y0, bz0), b10 = V(bx1, y0, bz0), b11 = V(bx1, y0, bz1), b01 = V(bx0, y0, bz1);
      const t00 = V(tx0, y1, tz0), t10 = V(tx1, y1, tz0), t11 = V(tx1, y1, tz1), t01 = V(tx0, y1, tz1);
      const face = (a, b, c, d) => {
        const w = a.distanceTo(b) / tile, h = a.distanceTo(d) / tile, uo = rng(), vo = rng();
        B.add(m, quadGeo(a, b, c, d, [uo, vo, uo + w, vo, uo + w, vo + h, uo, vo + h]), o.color);
      };
      face(b01, b11, t11, t01); face(b10, b00, t00, t10); face(b11, b10, t10, t11); face(b00, b01, t01, t00);
      face(t01, t11, t10, t00);
      if (o.collide !== false) B.collide(Math.min(bx0, tx0), y0, Math.min(bz0, tz0), Math.max(bx1, tx1), y1, Math.max(bz1, tz1), { surface: o.surface, navFree: o.navFree });
      return B;
    },

    // 간판 한 장. kind: 'lit' | 'off' | 'flicker', cell: 아틀라스 칸
    sign(kind, cell, x0, z0, x1, z1, y0, y1) {
      if (!cell) return B;
      return B.wall(G.mats.signs[kind] || G.mats.signs.off, x0, z0, x1, z1, y0, y1, { u: [cell.u0, cell.u1], v: [cell.v0, cell.v1] });
    },

    // 모아 둔 지오메트리를 재질별 한 메시로 합쳐 씬에 올린다.
    finish(parent) {
      const meshes = [];
      for (const [m, geos] of buckets) {
        if (!geos.length) continue;
        const merged = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
        if (!merged) { console.error('[build] 병합 실패: ' + m.name); continue; }
        const mesh = new THREE.Mesh(merged, m);
        mesh.name = 'level:' + (m.name || 'mat');
        const glowing = m.isMeshBasicMaterial || /^sign_/.test(m.name || '');
        mesh.castShadow = !glowing && !m.transparent;
        mesh.receiveShadow = !m.isMeshBasicMaterial;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        meshes.push(mesh);
      }
      buckets.clear();
      return meshes;
    },
  };
  return B;
}

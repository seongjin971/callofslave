import * as THREE from 'three';
import { clamp } from '../core/util.js';

// 물리: 축 정렬 박스(AABB) 월드. 레이캐스트, 시야 판정, 원기둥 몸체 이동, 격자 길찾기.
// 지면은 y=0 평면이고 인도·소품은 박스로 올라간다.

const NAV_CELL = 0.5;
const SQRT2 = Math.SQRT2;

export function createPhysics(G) {
  const boxes = [];
  const bounds = { min: new THREE.Vector3(-64, 0, -46), max: new THREE.Vector3(64, 40, 46) };
  const tmp = new THREE.Vector3();
  let groundSurface = () => 'asphalt';

  // ---- 길찾기 격자 ----
  const nav = { W: 0, H: 0, blocked: null, ready: false };
  let navG = null, navF = null, navFrom = null, navState = null, navStamp = null, stamp = 0;
  const heap = [];

  const api = {
    boxes, bounds, nav,
    setGroundSurface(fn) { groundSurface = fn; },

    addBox(min, max, o = {}) {
      const b = {
        min: new THREE.Vector3(Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)),
        max: new THREE.Vector3(Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)),
        surface: o.surface || 'concrete', tag: o.tag || '',
        navFree: !!o.navFree,              // 길찾기에서 무시(낮은 턱 등)
        shotsOnly: !!o.shotsOnly,    // 총알만 막는다
        bodyOnly: !!o.bodyOnly,    // 몸만 막는다(보이지 않는 경계)
      };
      boxes.push(b);
      nav.ready = false;
      return b;
    },
    removeBox(b) { const i = boxes.indexOf(b); if (i >= 0) boxes.splice(i, 1); },

    // 광선과 월드의 가장 가까운 교점. dir은 단위 벡터.
    raycast(o, d, maxDist = 500) {
      let best = maxDist, hitBox = null, axis = -1, sign = 0, ground = false;
      if (d.y < -1e-6) {
        const t = -o.y / d.y;
        if (t > 0 && t < best) { best = t; ground = true; }
      }
      const ix = d.x === 0 ? Infinity : 1 / d.x, iy = d.y === 0 ? Infinity : 1 / d.y, iz = d.z === 0 ? Infinity : 1 / d.z;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.bodyOnly) continue;
        let tn = 0, tf = best, ax = -1, sg = 0, t1, t2;
        if (d.x !== 0) {
          t1 = (b.min.x - o.x) * ix; t2 = (b.max.x - o.x) * ix; let s = -1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
          if (t1 > tn) { tn = t1; ax = 0; sg = s; }
          if (t2 < tf) tf = t2;
          if (tn > tf) continue;
        } else if (o.x < b.min.x || o.x > b.max.x) continue;
        if (d.y !== 0) {
          t1 = (b.min.y - o.y) * iy; t2 = (b.max.y - o.y) * iy; let s = -1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
          if (t1 > tn) { tn = t1; ax = 1; sg = s; }
          if (t2 < tf) tf = t2;
          if (tn > tf) continue;
        } else if (o.y < b.min.y || o.y > b.max.y) continue;
        if (d.z !== 0) {
          t1 = (b.min.z - o.z) * iz; t2 = (b.max.z - o.z) * iz; let s = -1;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
          if (t1 > tn) { tn = t1; ax = 2; sg = s; }
          if (t2 < tf) tf = t2;
          if (tn > tf) continue;
        } else if (o.z < b.min.z || o.z > b.max.z) continue;
        if (ax < 0) continue;            // 박스 안에서 출발
        best = tn; hitBox = b; axis = ax; sign = sg; ground = false;
      }
      if (!hitBox && !ground) return null;
      const point = new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best);
      if (ground) return { dist: best, point, normal: new THREE.Vector3(0, 1, 0), surface: groundSurface(point.x, point.z), box: null };
      const normal = new THREE.Vector3();
      normal.setComponent(axis, sign);
      return { dist: best, point, normal, surface: hitBox.surface, box: hitBox };
    },

    lineOfSight(a, b) {
      tmp.subVectors(b, a);
      const len = tmp.length();
      if (len < 1e-4) return true;
      tmp.multiplyScalar(1 / len);
      const hit = api.raycast(a, tmp, len - 0.05);
      return !hit;
    },

    pointBlocked(x, y, z, pad = 0) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.bodyOnly) continue;
        if (x > b.min.x - pad && x < b.max.x + pad && y > b.min.y - pad && y < b.max.y + pad && z > b.min.z - pad && z < b.max.z + pad) return true;
      }
      return false;
    },

    // 발밑 높이(발이 디딜 수 있는 가장 높은 면)
    groundAt(x, z, y = 0.5, step = 0.45) {
      let g = 0;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.shotsOnly) continue;
        if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
        if (b.max.y <= y + step && b.max.y > g) g = b.max.y;
      }
      return g;
    },

    // 원기둥 몸체(body: pos=발 위치, vel, radius, height) 이동과 충돌 해소
    moveBody(body, dt) {
      const p = body.pos, v = body.vel, r = body.radius, h = body.height;
      const step = body.onGround ? (body.step ?? 0.42) : (body.airStep ?? 0.2);
      const dist = Math.hypot(v.x, v.z) * dt;
      const steps = Math.max(1, Math.ceil(dist / (r * 0.6)));
      for (let s = 0; s < steps; s++) {
        p.x += (v.x * dt) / steps; p.z += (v.z * dt) / steps;
        for (let it = 0; it < 3; it++) {
          let pushed = false;
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (b.shotsOnly) continue;
            if (b.max.y <= p.y + step || b.min.y >= p.y + h) continue;
            const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
            let dx = p.x - cx, dz = p.z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-9) {
              const d = Math.sqrt(d2);
              dx /= d; dz /= d;
              p.x += dx * (r - d); p.z += dz * (r - d);
              const vn = v.x * dx + v.z * dz;
              if (vn < 0) { v.x -= vn * dx; v.z -= vn * dz; }
            } else {
              // 중심이 박스 안에 들어온 경우: 가장 가까운 면으로 밀어낸다
              const l = p.x - b.min.x, rr = b.max.x - p.x, n = p.z - b.min.z, f = b.max.z - p.z;
              const m = Math.min(l, rr, n, f);
              if (m === l) { p.x = b.min.x - r; if (v.x > 0) v.x = 0; }
              else if (m === rr) { p.x = b.max.x + r; if (v.x < 0) v.x = 0; }
              else if (m === n) { p.z = b.min.z - r; if (v.z > 0) v.z = 0; }
              else { p.z = b.max.z + r; if (v.z < 0) v.z = 0; }
            }
            pushed = true;
          }
          if (!pushed) break;
        }
      }
      // 수직
      const wasGround = body.onGround;
      p.y += v.y * dt;
      let ground = 0, surface = null, ceil = Infinity;
      const fr = r * 0.55;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.shotsOnly) continue;
        if (p.x < b.min.x - fr || p.x > b.max.x + fr || p.z < b.min.z - fr || p.z > b.max.z + fr) continue;
        if (b.max.y <= p.y + step + 0.001) { if (b.max.y > ground) { ground = b.max.y; surface = b.surface; } }
        else if (b.min.y >= p.y + h - 0.35 && b.min.y < ceil) ceil = b.min.y;
      }
      body.landed = 0;
      if (p.y <= ground) {
        if (!wasGround && v.y < -1) body.landed = -v.y;
        p.y = ground; if (v.y < 0) v.y = 0; body.onGround = true;
      } else if (wasGround && v.y <= 0 && p.y - ground <= 0.45) {
        p.y = ground; v.y = 0; body.onGround = true;      // 낮은 턱을 내려갈 때 바닥에 붙인다
      } else {
        body.onGround = false;
      }
      if (p.y + h > ceil) { p.y = ceil - h; if (v.y > 0) v.y = 0; }
      body.surface = surface || groundSurface(p.x, p.z);
      // 월드 경계
      p.x = clamp(p.x, bounds.min.x + r, bounds.max.x - r);
      p.z = clamp(p.z, bounds.min.z + r, bounds.max.z - r);
    },

    // 구(드론) 밀어내기
    pushSphere(pos, r) {
      let hit = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.bodyOnly) continue;
        const cx = clamp(pos.x, b.min.x, b.max.x), cy = clamp(pos.y, b.min.y, b.max.y), cz = clamp(pos.z, b.min.z, b.max.z);
        const dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.y += dy * k; pos.z += dz * k; }
        else pos.y = b.max.y + r;
      }
      if (pos.y < r) { pos.y = r; hit = true; }
      return hit;
    },

    // ---- 길찾기 ----
    build() {
      const W = Math.ceil((bounds.max.x - bounds.min.x) / NAV_CELL), H = Math.ceil((bounds.max.z - bounds.min.z) / NAV_CELL);
      nav.W = W; nav.H = H;
      const blocked = new Uint8Array(W * H);
      const pad = 0.42;
      for (const b of boxes) {
        if (b.shotsOnly || b.navFree) continue;
        if (b.max.y < 0.5 || b.min.y > 1.4) continue;     // 넘을 수 있는 턱, 머리 위 구조물은 무시
        const x0 = Math.max(0, Math.floor((b.min.x - pad - bounds.min.x) / NAV_CELL)), x1 = Math.min(W - 1, Math.floor((b.max.x + pad - bounds.min.x) / NAV_CELL));
        const z0 = Math.max(0, Math.floor((b.min.z - pad - bounds.min.z) / NAV_CELL)), z1 = Math.min(H - 1, Math.floor((b.max.z + pad - bounds.min.z) / NAV_CELL));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * W + x] = 1;
      }
      for (let x = 0; x < W; x++) { blocked[x] = 1; blocked[(H - 1) * W + x] = 1; }
      for (let z = 0; z < H; z++) { blocked[z * W] = 1; blocked[z * W + W - 1] = 1; }
      nav.blocked = blocked;
      navG = new Float32Array(W * H); navF = new Float32Array(W * H); navFrom = new Int32Array(W * H);
      navState = new Uint8Array(W * H); navStamp = new Uint32Array(W * H);
      nav.ready = true;
    },
    cellOf(x, z) {
      const cx = clamp(Math.floor((x - bounds.min.x) / NAV_CELL), 0, nav.W - 1), cz = clamp(Math.floor((z - bounds.min.z) / NAV_CELL), 0, nav.H - 1);
      return cz * nav.W + cx;
    },
    cellPos(i, out = new THREE.Vector3()) {
      return out.set(bounds.min.x + ((i % nav.W) + 0.5) * NAV_CELL, 0, bounds.min.z + (Math.floor(i / nav.W) + 0.5) * NAV_CELL);
    },
    walkable(x, z) { return nav.ready && !nav.blocked[api.cellOf(x, z)]; },
    nearestFree(i, maxR = 10) {
      if (!nav.blocked[i]) return i;
      const W = nav.W, H = nav.H, cx = i % W, cz = Math.floor(i / W);
      for (let r = 1; r <= maxR; r++) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= W || z >= H) continue;
          if (!nav.blocked[z * W + x]) return z * W + x;
        }
      }
      return -1;
    },
    // 격자 위 직선 통행 가능 여부
    navClear(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      const n = Math.ceil(len / (NAV_CELL * 0.5));
      for (let i = 0; i <= n; i++) {
        const t = n ? i / n : 0;
        if (nav.blocked[api.cellOf(ax + dx * t, az + dz * t)]) return false;
      }
      return true;
    },
    // A* 경로. 반환: Vector3 배열(시작 제외, 목표 포함) 또는 null
    findPath(from, to, maxIter = 9000) {
      if (!nav.ready) api.build();
      const W = nav.W, H = nav.H, blocked = nav.blocked;
      const start = api.nearestFree(api.cellOf(from.x, from.z)), goal = api.nearestFree(api.cellOf(to.x, to.z));
      if (start < 0 || goal < 0) return null;
      if (start === goal) return [new THREE.Vector3(to.x, 0, to.z)];
      stamp++;
      const gx = goal % W, gz = Math.floor(goal / W);
      const hfn = (i) => { const dx = Math.abs((i % W) - gx), dz = Math.abs(Math.floor(i / W) - gz); return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz); };
      heap.length = 0;
      const push = (i) => { heap.push(i); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (navF[heap[p]] <= navF[heap[c]]) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; } };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last; let p = 0;
          for (;;) { const l = p * 2 + 1, r = l + 1; let m = p; if (l < heap.length && navF[heap[l]] < navF[heap[m]]) m = l; if (r < heap.length && navF[heap[r]] < navF[heap[m]]) m = r; if (m === p) break; const t = heap[p]; heap[p] = heap[m]; heap[m] = t; p = m; }
        }
        return top;
      };
      navStamp[start] = stamp; navState[start] = 1; navG[start] = 0; navF[start] = hfn(start); navFrom[start] = -1;
      push(start);
      let found = false, iter = 0;
      while (heap.length && iter++ < maxIter) {
        const cur = pop();
        if (navState[cur] === 2 && navStamp[cur] === stamp) continue;
        navState[cur] = 2;
        if (cur === goal) { found = true; break; }
        const cx = cur % W, cz = Math.floor(cur / W);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const ni = nz * W + nx;
          if (blocked[ni]) continue;
          if (dx && dz && (blocked[cz * W + nx] || blocked[nz * W + cx])) continue;    // 모서리 통과 금지
          if (navStamp[ni] === stamp && navState[ni] === 2) continue;
          const ng = navG[cur] + (dx && dz ? SQRT2 : 1);
          if (navStamp[ni] !== stamp || ng < navG[ni]) {
            navStamp[ni] = stamp; navState[ni] = 1; navG[ni] = ng; navF[ni] = ng + hfn(ni); navFrom[ni] = cur;
            push(ni);
          }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let c = goal; c !== -1; c = navFrom[c]) cells.push(c);
      cells.reverse();
      // 직선으로 갈 수 있는 구간은 건너뛴다
      const pts = cells.map((c) => api.cellPos(c));
      const out = [];
      let anchor = 0;
      while (anchor < pts.length - 1) {
        let next = pts.length - 1;
        while (next > anchor + 1 && !api.navClear(pts[anchor].x, pts[anchor].z, pts[next].x, pts[next].z)) next--;
        out.push(pts[next]);
        anchor = next;
      }
      if (!nav.blocked[api.cellOf(to.x, to.z)] && out.length) out[out.length - 1].set(to.x, 0, to.z);
      return out;
    },
  };
  return api;
}

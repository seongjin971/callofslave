import * as THREE from 'three';
import { Layers, fbm, vnoise, hash2, mkCanvas, texFrom } from './tex.js';
import { buildSignAtlas, loadSignFonts } from './signs.js';
import { createRng, lerp, smoothstep } from '../core/util.js';

// 재질 라이브러리. 모든 텍스처는 실행 시 캔버스로 만든다.
// 표준 재질은 정점색(vertexColors)을 곱하므로, 이 재질을 쓰는 지오메트리는 color 속성이 꼭 있어야 한다.
// userData.tile = 텍스처 한 장이 덮는 실제 길이(m).

const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- 벽 바탕 무늬 ----
const brickFn = (N, cols, rows, seed) => (o, x, y, u, v) => {
  const bw = N / cols, bh = N / rows;
  const row = Math.floor(y / bh);
  const xs = (x + ((row & 1) ? bw / 2 : 0)) % N;
  const col = Math.floor(xs / bw);
  const lx = xs - col * bw, ly = y - row * bh;
  const j = smoothstep(1.3, 0.3, Math.min(lx, bw - lx, ly, bh - ly));
  const id = hash2(col, row, seed), n = fbm(u, v, 4, 4, 4, seed + 1), g = hash2(x, y, seed + 2);
  const k = 0.78 + id * 0.42 + (n - 0.5) * 0.3 + (g - 0.5) * 0.08;
  o.r = lerp(128 * k, 118, j); o.g = lerp(56 * k, 114, j); o.b = lerp(44 * k, 106, j);
  o.h = 0.6 - j * 0.35 + (id - 0.5) * 0.08;
  o.rough = 0.76 + j * 0.12;
};

const tileFn = (N, cols, rows, seed, base) => (o, x, y, u, v) => {
  const bw = N / cols, bh = N / rows;
  const col = Math.floor(x / bw), row = Math.floor(y / bh);
  const lx = x - col * bw, ly = y - row * bh;
  const j = smoothstep(1.2, 0.3, Math.min(lx, bw - lx, ly, bh - ly));
  const id = hash2(col, row, seed), n = fbm(u, v, 3, 3, 4, seed + 1), s = fbm(u, v, 16, 2, 3, seed + 3);
  const chipped = id > 0.975 ? 0.55 : 1;
  const k = (0.9 + id * 0.14 + (n - 0.5) * 0.22) * (1 - Math.max(0, s - 0.56) * 0.85) * chipped;
  o.r = lerp(base[0] * k, 70, j); o.g = lerp(base[1] * k, 68, j); o.b = lerp(base[2] * k, 64, j);
  o.h = 0.58 - j * 0.3 - (chipped < 1 ? 0.2 : 0);
  o.rough = chipped < 1 ? 0.85 : 0.3 + (n - 0.5) * 0.2 + j * 0.4;
};

const plasterFn = (N, seed, base) => (o, x, y, u, v) => {
  const n = fbm(u, v, 3, 3, 5, seed), s = fbm(u, v, 14, 2, 3, seed + 1), g = hash2(x, y, seed + 2);
  const k = (0.86 + (n - 0.5) * 0.36 + (g - 0.5) * 0.06) * (1 - Math.max(0, s - 0.54) * 0.95);
  o.r = base[0] * k; o.g = base[1] * k; o.b = base[2] * k;
  o.h = 0.5 + (n - 0.5) * 0.22 + (g - 0.5) * 0.12;
  o.rough = 0.74 + (n - 0.5) * 0.22;
};

export async function createMaterials(G, onProgress = () => {}) {
  const T = G.quality.tex;                    // 주 해상도
  const H = Math.max(256, T >> 1);            // 보조 해상도
  const aniso = Math.min(8, G.renderer.capabilities.getMaxAnisotropy());
  const lib = new Map();

  function std(name, tex, tile, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.orm, metalnessMap: tex.orm,
      roughness: 1, metalness: 1, vertexColors: true, ...opts,
    });
    if (tex.emissiveMap) { m.emissiveMap = tex.emissiveMap; m.emissive = new THREE.Color(1, 1, 1); }
    m.name = name; m.userData.tile = tile;
    lib.set(name, m);
    return m;
  }

  await loadSignFonts();

  // ---- 아스팔트(젖은 노면 + 물웅덩이) ----
  {
    const N = T, L = new Layers(N), gp = Math.max(8, Math.round(N / 3));
    L.fill((o, x, y, u, v) => {
      const n = fbm(u, v, 4, 4, 5, 11), g = hash2(x, y, 3), g2 = vnoise(u * gp, v * gp, gp, gp, 5);
      const pud = smoothstep(0.54, 0.63, fbm(u, v, 3, 3, 4, 23) * 0.8 + n * 0.2);
      const c = (26 + n * 20 + (g - 0.5) * 14 + (g2 - 0.5) * 16) * (1 - pud * 0.5);
      o.r = c * 0.97; o.g = c; o.b = c * 1.07;
      o.h = 0.5 + ((g - 0.5) * 0.45 + (g2 - 0.5) * 0.55) * (1 - pud);
      o.rough = lerp(0.44 + (n - 0.5) * 0.3 + (g - 0.5) * 0.2, 0.02, pud);
    });
    const rnd = createRng(77);
    for (let k = 0; k < 9; k++) {
      let px = rnd() * N, py = rnd() * N, a = rnd() * 6.28;
      const pts = [[px, py]];
      for (let s = 0; s < 14; s++) { a += rnd.range(-0.7, 0.7); px += Math.cos(a) * N * 0.03; py += Math.sin(a) * N * 0.03; pts.push([px, py]); }
      L.line(pts, { color: '#08090b', height: 0.18, width: Math.max(1, N / 420), alpha: 0.85 });
    }
    std('asphalt', L.textures({ normal: 2.4, aniso }), 5, { envMapIntensity: 0.3 });
  }
  onProgress(0.12); await tick();

  // ---- 보도블록 ----
  {
    const N = H, L = new Layers(N);
    L.fill((o, x, y, u, v) => {
      const bw = N / 10, bh = N / 20;
      const row = Math.floor(y / bh);
      const xs = (x + ((row & 1) ? bw / 2 : 0)) % N;
      const col = Math.floor(xs / bw);
      const lx = xs - col * bw, ly = y - row * bh;
      const j = smoothstep(1.6, 0.4, Math.min(lx, bw - lx, ly, bh - ly));
      const id = hash2(col, row, 7), n = fbm(u, v, 4, 4, 4, 41), g = hash2(x, y, 9);
      const warm = id > 0.82 ? 1 : 0;
      const c = (88 + (id - 0.5) * 26 + (n - 0.5) * 34 + (g - 0.5) * 10) * (1 - j * 0.55);
      o.r = c * (1 + 0.14 * warm); o.g = c * (1 - 0.05 * warm); o.b = c * (0.98 - 0.12 * warm);
      o.h = 0.56 - j * 0.34 + (g - 0.5) * 0.08;
      o.rough = 0.36 + (n - 0.5) * 0.34 + j * 0.3;
    });
    std('sidewalk', L.textures({ normal: 2.2, aniso }), 2, { envMapIntensity: 0.4 });
  }

  // ---- 콘크리트 ----
  {
    const N = H, L = new Layers(N);
    L.fill((o, x, y, u, v) => {
      const n = fbm(u, v, 3, 3, 5, 51), s = fbm(u, v, 14, 2, 3, 52), g = hash2(x, y, 53);
      const pore = g > 0.986 ? 0.72 : 1;
      const c = (120 + (n - 0.5) * 48 + (g - 0.5) * 10) * (1 - Math.max(0, s - 0.55) * 0.9) * pore;
      o.r = c * 1.01; o.g = c; o.b = c * 0.97;
      o.h = 0.5 + (n - 0.5) * 0.3 + (g - 0.5) * 0.14 - (pore < 1 ? 0.3 : 0);
      o.rough = 0.7 + (n - 0.5) * 0.26;
    });
    std('concrete', L.textures({ normal: 1.8, aniso }), 3);
  }
  onProgress(0.25); await tick();

  // ---- 창문 달린 외벽 3종 (한 장 = 4칸 × 4층, 12m) ----
  function facade(name, baseFn, seed, o) {
    const N = T, L = new Layers(N, { emissive: true }), s = N / 1024;
    L.fill(baseFn(N));
    const rnd = createRng(seed);
    const cell = N / 4;
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 4; fx++) {
        const cx = fx * cell, cy = fy * cell;
        // 층 슬래브 띠
        L.rect(cx, cy + cell - 9 * s, cell, 9 * s, { color: 'rgba(0,0,0,0.22)', height: 0.42 });
        const ww = cell * 0.58, wh = cell * 0.47, wx = cx + (cell - ww) / 2, wy = cy + cell * 0.2;
        // 빗물 자국
        const stain = L.c.createLinearGradient(0, wy + wh, 0, cy + cell);
        stain.addColorStop(0, 'rgba(0,0,0,0.30)'); stain.addColorStop(1, 'rgba(0,0,0,0)');
        L.c.fillStyle = stain; L.c.fillRect(wx + rnd.range(0, ww * 0.5), wy + wh, ww * rnd.range(0.2, 0.5), cell * 0.3);
        // 창틀과 유리
        L.rect(wx - 5 * s, wy - 5 * s, ww + 10 * s, wh + 10 * s, { color: o.frame, height: 0.66, rough: 0.5 });
        const lit = rnd() < o.lit;
        L.rect(wx, wy, ww, wh, { color: lit ? '#2c261a' : '#070b11', height: 0.3, rough: 0.07 });
        const refl = L.c.createLinearGradient(wx, wy, wx + ww, wy + wh);
        refl.addColorStop(0, 'rgba(120,150,190,0.16)'); refl.addColorStop(0.5, 'rgba(120,150,190,0)');
        L.c.fillStyle = refl; L.c.fillRect(wx, wy, ww, wh);
        if (lit) {
          const warm = rnd() < 0.7;
          const gl = L.e.createLinearGradient(0, wy, 0, wy + wh);
          gl.addColorStop(0, warm ? '#a8691f' : '#5f7f96'); gl.addColorStop(1, warm ? '#4a2a0a' : '#22323e');
          L.e.fillStyle = gl; L.e.fillRect(wx, wy, ww, wh);
          // 커튼
          L.e.fillStyle = 'rgba(0,0,0,0.55)';
          L.e.fillRect(wx, wy, ww * rnd.range(0.15, 0.4), wh);
          L.e.fillRect(wx + ww * rnd.range(0.7, 0.9), wy, ww * 0.3, wh);
        }
        // 가운데 창살
        L.rect(wx + ww / 2 - 2 * s, wy, 4 * s, wh, { color: o.frame, height: 0.62, rough: 0.5 });
        if (lit) { L.e.fillStyle = '#000'; L.e.fillRect(wx + ww / 2 - 2 * s, wy, 4 * s, wh); }
        const kind = rnd();
        if (kind < 0.3) {
          // 방범창
          for (let b = 1; b < 9; b++) L.rect(wx + (ww * b) / 9 - s, wy, 2 * s, wh, { color: '#9aa0a2', height: 0.74, rough: 0.4, metal: 0.6 });
          L.rect(wx, wy + wh * 0.33, ww, 2 * s, { color: '#9aa0a2', height: 0.74, rough: 0.4, metal: 0.6 });
          L.rect(wx, wy + wh * 0.66, ww, 2 * s, { color: '#9aa0a2', height: 0.74, rough: 0.4, metal: 0.6 });
        } else if (kind < 0.62) {
          // 공습 대비 X자 테이프
          for (const half of [0, 1]) {
            const x0 = wx + (ww / 2) * half + 3 * s, x1 = wx + (ww / 2) * (half + 1) - 3 * s;
            L.line([[x0, wy + 3 * s], [x1, wy + wh - 3 * s]], { color: 'rgba(214,206,170,0.75)', width: 3.2 * s });
            L.line([[x1, wy + 3 * s], [x0, wy + wh - 3 * s]], { color: 'rgba(214,206,170,0.75)', width: 3.2 * s });
          }
        }
        if (rnd() < 0.4) {
          // 실외기
          const aw = cell * 0.2, ah = cell * 0.13, ax = wx + rnd.range(0, ww - aw), ay = wy + wh + 12 * s;
          L.rect(ax, ay, aw, ah, { color: '#b9bbb6', height: 0.9, rough: 0.5, metal: 0.3 });
          L.rect(ax + aw * 0.1, ay + ah * 0.14, aw * 0.5, ah * 0.72, { color: '#3a3d3e', height: 0.8, rough: 0.6 });
          L.rect(ax, ay + ah, aw, 3 * s, { color: 'rgba(0,0,0,0.5)' });
        }
      }
    }
    // 세로 배수관
    L.rect(N * 0.245, 0, 7 * s, N, { color: o.pipe, height: 0.82, rough: 0.45 });
    return std(name, L.textures({ normal: 2.6, aniso }), 12, { emissiveIntensity: 1.5, envMapIntensity: 0.7 });
  }
  facade('facade_tile', (N) => tileFn(N, 40, 80, 61, [200, 190, 166]), 601, { frame: '#d6d2c4', lit: 0.09, pipe: '#8f8a7c' });
  onProgress(0.4); await tick();
  facade('facade_brick', (N) => brickFn(N, 50, 150, 63), 602, { frame: '#4a3a30', lit: 0.07, pipe: '#6a655c' });
  onProgress(0.52); await tick();
  facade('facade_plaster', (N) => plasterFn(N, 65, [150, 152, 150]), 603, { frame: '#2c3034', lit: 0.1, pipe: '#55585a' });
  onProgress(0.64); await tick();

  // ---- 창 없는 벽(옆·뒷면, 1층) ----
  {
    const L = new Layers(H); L.fill(brickFn(H, 13, 38, 63));
    std('brick', L.textures({ normal: 2.4, aniso }), 3);
    const L2 = new Layers(H); L2.fill(tileFn(H, 10, 20, 61, [200, 190, 166]));
    std('tile', L2.textures({ normal: 2.2, aniso }), 3, { envMapIntensity: 0.7 });
  }

  // ---- 셔터 ----
  {
    const N = H, L = new Layers(N), s = N / 512;
    L.fill((o, x, y, u, v) => {
      const slat = Math.sin(v * Math.PI * 2 * 36);
      const n = fbm(u, v, 3, 3, 4, 71), st = fbm(u, v, 18, 2, 3, 72), g = hash2(x, y, 73);
      const c = (176 + slat * 16 + (n - 0.5) * 36 + (g - 0.5) * 8) * (1 - Math.max(0, st - 0.5) * 0.8);
      o.r = c; o.g = c; o.b = c * 1.02;
      o.h = 0.5 + slat * 0.32;
      o.rough = 0.42 + (n - 0.5) * 0.25; o.metal = 0.55;
    });
    L.rect(0, N * 0.935, N, N * 0.065, { color: '#4d5052', height: 0.72, rough: 0.5, metal: 0.6 });
    L.rect(N * 0.47, N * 0.9, N * 0.06, N * 0.02, { color: '#2a2c2e', height: 0.8, rough: 0.4, metal: 0.8 });
    // 전단지
    const rnd = createRng(88), paper = ['#e8e2cf', '#f0d24a', '#e9a0b4', '#bfe0ea'];
    for (let k = 0; k < 5; k++) {
      const fw = rnd.range(34, 60) * s, fh = rnd.range(44, 72) * s, fx = rnd.range(0.06, 0.8) * N, fy = rnd.range(0.35, 0.72) * N;
      L.rect(fx, fy, fw, fh, { color: rnd.pick(paper), height: 0.6, rough: 0.9 });
      L.c.fillStyle = 'rgba(20,20,20,0.75)';
      for (let l = 0; l < 4; l++) L.c.fillRect(fx + fw * 0.12, fy + fh * (0.16 + l * 0.2), fw * rnd.range(0.4, 0.76), fh * 0.07);
    }
    std('shutter', L.textures({ normal: 3, aniso }), 3, { envMapIntensity: 0.9 });

    // 세로 골이 진 강판(컨테이너)
    const L2 = new Layers(N);
    L2.fill((o, x, y, u, v) => {
      const rib = Math.sin(u * Math.PI * 2 * 24);
      const n = fbm(u, v, 3, 3, 4, 75), st = fbm(u, v, 16, 2, 3, 76), g = hash2(x, y, 77);
      const rust = smoothstep(0.62, 0.78, fbm(u, v, 5, 5, 4, 78));
      const c = (196 + rib * 18 + (n - 0.5) * 40 + (g - 0.5) * 8) * (1 - Math.max(0, st - 0.5) * 0.7);
      o.r = lerp(c, 118, rust * 0.8); o.g = lerp(c, 66, rust * 0.8); o.b = lerp(c, 38, rust * 0.8);
      o.h = 0.5 + rib * 0.34;
      o.rough = lerp(0.46 + (n - 0.5) * 0.2, 0.86, rust);
    });
    std('corrugated', L2.textures({ normal: 3, aniso }), 3, { envMapIntensity: 0.7 });
  }
  onProgress(0.72); await tick();

  // ---- 도장 금속(정점색으로 색을 입힘) / 맨 금속 / 무광 ----
  {
    const N = H, L = new Layers(N);
    L.fill((o, x, y, u, v) => {
      const n = fbm(u, v, 4, 4, 5, 81), g = hash2(x, y, 82), sc = fbm(u, v, 2, 26, 3, 83);
      const c = 214 + (n - 0.5) * 40 + (g - 0.5) * 8 - Math.max(0, sc - 0.64) * 130;
      const rust = smoothstep(0.68, 0.8, fbm(u, v, 6, 6, 4, 84));
      o.r = lerp(c, 122, rust * 0.85); o.g = lerp(c, 70, rust * 0.85); o.b = lerp(c, 40, rust * 0.85);
      o.h = 0.5 + (n - 0.5) * 0.12 - rust * 0.12 + (g - 0.5) * 0.05;
      o.rough = lerp(0.38 + (n - 0.5) * 0.22, 0.88, rust);
    });
    std('metal', L.textures({ normal: 1.4, aniso }), 2, { envMapIntensity: 0.9 });

    const M = 256, L2 = new Layers(M);
    L2.fill((o, x, y, u, v) => {
      const n = fbm(u, v, 4, 4, 4, 91), sc = fbm(u, v, 2, 30, 3, 92), g = hash2(x, y, 93);
      const c = 168 + (n - 0.5) * 50 + (sc - 0.5) * 40 + (g - 0.5) * 10;
      o.r = c; o.g = c; o.b = c * 1.02;
      o.h = 0.5 + (sc - 0.5) * 0.3 + (g - 0.5) * 0.08;
      o.rough = 0.34 + (n - 0.5) * 0.3; o.metal = 1;
    });
    std('steel', L2.textures({ normal: 1.2, aniso }), 1.5, { envMapIntensity: 1.2 });

    const L3 = new Layers(M);
    L3.fill((o, x, y, u, v) => {
      const n = fbm(u, v, 4, 4, 4, 95), g = hash2(x, y, 96);
      const c = 212 + (n - 0.5) * 34 + (g - 0.5) * 10;
      o.r = c; o.g = c; o.b = c;
      o.h = 0.5 + (n - 0.5) * 0.2 + (g - 0.5) * 0.14;
      o.rough = 0.66 + (n - 0.5) * 0.2;
    });
    std('matte', L3.textures({ normal: 1.2, aniso }), 1.5, { envMapIntensity: 0.5 });
  }

  // ---- 사낭(마대) / 천막 / 목재 ----
  {
    const M = 256, L = new Layers(M);
    L.fill((o, x, y, u, v) => {
      const w = Math.sin(u * Math.PI * 2 * 44) * Math.sin(v * Math.PI * 2 * 44);
      const n = fbm(u, v, 3, 3, 4, 111), g = hash2(x, y, 112);
      const c = 168 + w * 20 + (n - 0.5) * 50 + (g - 0.5) * 14;
      o.r = c; o.g = c; o.b = c;
      o.h = 0.5 + w * 0.3 + (n - 0.5) * 0.3;
      o.rough = 0.9;
    });
    std('sandbag', L.textures({ normal: 2.4, aniso }), 0.8, { envMapIntensity: 0.3 });

    const L2 = new Layers(M);
    L2.fill((o, x, y, u, v) => {
      const n = fbm(u, v, 3, 3, 4, 121), w = Math.sin(u * Math.PI * 2 * 60) * Math.sin(v * Math.PI * 2 * 60), s = fbm(u, v, 12, 2, 3, 122);
      const c = (214 + (n - 0.5) * 34 + w * 6) * (1 - Math.max(0, s - 0.56) * 0.6);
      o.r = c; o.g = c; o.b = c;
      o.h = 0.5 + (n - 0.5) * 0.85 + w * 0.05;
      o.rough = 0.36 + (n - 0.5) * 0.2;
    });
    std('tarp', L2.textures({ normal: 2.6, aniso }), 2, { envMapIntensity: 0.6, side: THREE.DoubleSide });

    const N = H, L3 = new Layers(N);
    L3.fill((o, x, y, u, v) => {
      const plank = Math.floor(v * 8), pv = v * 8 - plank;
      const grain = fbm(u, v, 2, 40, 4, 131 + plank), n = fbm(u, v, 4, 4, 3, 132), id = hash2(plank, 3, 133);
      const gap = smoothstep(0.035, 0.0, Math.min(pv, 1 - pv));
      const k = (0.7 + grain * 0.55 + (n - 0.5) * 0.2) * (0.86 + id * 0.28) * (1 - gap * 0.75);
      o.r = 132 * k; o.g = 96 * k; o.b = 60 * k;
      o.h = 0.55 + (grain - 0.5) * 0.3 - gap * 0.4;
      o.rough = 0.72 + gap * 0.2;
    });
    std('wood', L3.textures({ normal: 2, aniso }), 1.6, { envMapIntensity: 0.4 });
  }
  onProgress(0.82); await tick();

  // ---- 화강암 디지털 위장(전투복 소매) ----
  {
    const M = 256, L = new Layers(M), pal = [[58, 62, 50], [96, 98, 80], [136, 132, 108], [38, 40, 38]];
    L.fill((o, x, y, u, v) => {
      const bx = Math.floor(u * 56), by = Math.floor(v * 56);
      const t = vnoise(bx / 7, by / 7, 8, 8, 201) * 0.62 + vnoise(bx / 3, by / 3, 19, 19, 202) * 0.38 + (hash2(bx, by, 203) - 0.5) * 0.14;
      const c = pal[t < 0.4 ? 0 : t < 0.52 ? 1 : t < 0.64 ? 2 : 3];
      const w = Math.sin(u * Math.PI * 2 * 80) * Math.sin(v * Math.PI * 2 * 80);
      const k = 1 + w * 0.06;
      o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k;
      o.h = 0.5 + w * 0.25; o.rough = 0.88;
    });
    std('camo', L.textures({ normal: 1.6, aniso }), 0.35, { envMapIntensity: 0.25 });
  }

  // ---- 도로 표시 페인트(닳은 자리는 아스팔트가 드러난다) ----
  {
    const M = 256, L = new Layers(M);
    L.fill((o, x, y, u, v) => {
      const wear = smoothstep(0.5, 0.68, fbm(u, v, 5, 5, 4, 141)), g = hash2(x, y, 142);
      const c = lerp(232 + (g - 0.5) * 16, 44, wear * 0.9);
      o.r = c; o.g = c; o.b = c;
      o.h = 0.55 - wear * 0.1 + (g - 0.5) * 0.1;
      o.rough = lerp(0.42, 0.3, wear);
    });
    std('paint', L.textures({ normal: 1.2, aniso }), 2, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.3 });
  }

  // ---- 텍스처 없는 재질 ----
  const plain = (name, opts) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts }); m.name = name; m.userData.tile = 1; lib.set(name, m); return m; };
  plain('glass', { color: 0x0a1016, roughness: 0.05, metalness: 0, envMapIntensity: 1.6 });
  plain('carpaint', { roughness: 0.28, metalness: 0.35, envMapIntensity: 1.1 });
  plain('rubber', { color: 0x1c1c1e, roughness: 0.92, metalness: 0, envMapIntensity: 0.2 });

  // ---- 간판 ----
  const atlas = buildSignAtlas(T >= 1024 ? 2048 : 1024, aniso);
  const SIGN_GLOW = 1.1;
  const signLit = new THREE.MeshStandardMaterial({ map: atlas.texture, color: 0x555555, emissiveMap: atlas.texture, emissive: 0xffffff, emissiveIntensity: SIGN_GLOW, roughness: 0.35, metalness: 0 });
  const signOff = new THREE.MeshStandardMaterial({ map: atlas.texture, color: 0x8c8c8c, roughness: 0.38, metalness: 0, envMapIntensity: 0.8 });
  const signFlicker = signLit.clone();
  signLit.name = 'sign_lit'; signOff.name = 'sign_off'; signFlicker.name = 'sign_flicker';
  lib.set('sign_lit', signLit); lib.set('sign_off', signOff); lib.set('sign_flicker', signFlicker);

  // ---- 편의점 내부(밖에서 보이는 발광 판) ----
  {
    const c = mkCanvas(512, 256), g = c.getContext('2d'), rnd = createRng(909);
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#f4f8f2'); bg.addColorStop(0.75, '#cdd6cc'); bg.addColorStop(1, '#8a938a');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    const cols = ['#d83a2e', '#f2c21a', '#2a7fd0', '#3aa857', '#f08a2a', '#ffffff', '#7a3fb0', '#1b1b1b'];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 46 + shelf * 44;
      g.fillStyle = '#7d8580'; g.fillRect(0, y + 34, 512, 5);
      let x = 6;
      while (x < 500) { const w = rnd.range(8, 22), h = rnd.range(18, 32); g.fillStyle = rnd.pick(cols); g.fillRect(x, y + 34 - h, w, h); x += w + rnd.range(1, 4); }
    }
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 8, 512, 12);     // 천장 조명
    const t = texFrom(c, { srgb: true, repeat: false, aniso });
    const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color().setRGB(1.5, 1.6, 1.5) });
    m.name = 'store_interior'; lib.set('store_interior', m);
  }
  onProgress(0.95); await tick();

  // 젖은 노면 재질에 평면 반사를 끼운다.
  if (G.render.reflection) {
    G.render.reflection.patch(lib.get('asphalt'), 1.0);
    G.render.reflection.patch(lib.get('sidewalk'), 0.75);
    G.render.reflection.patch(lib.get('paint'), 0.55);
  }

  const emissives = new Map();
  let t = 0;
  return {
    lib,
    signs: { lit: signLit, off: signOff, flicker: signFlicker, cells: atlas.cells },
    get(name) {
      const m = lib.get(name);
      if (!m) { console.error(`[mats] 없는 재질: ${name}`); return lib.get('matte'); }
      return m;
    },
    // HDR 발광색 재질(블룸 대상). 같은 색·세기는 한 재질을 공유한다.
    emissive(hex, intensity = 2) {
      const key = hex + ':' + intensity;
      if (!emissives.has(key)) {
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) });
        m.name = 'emissive_' + key; m.userData.tile = 1;
        emissives.set(key, m);
      }
      return emissives.get(key);
    },
    update(dt) {
      t += dt;
      // 깜빡이는 간판: 대체로 켜져 있다가 불규칙하게 꺼진다.
      const f = Math.sin(t * 23.0) + Math.sin(t * 37.7 + 1.3) + Math.sin(t * 5.1 + 0.4);
      signFlicker.emissiveIntensity = f > 1.1 ? 0.08 : f > 0.8 ? SIGN_GLOW * 0.5 : SIGN_GLOW;
    },
  };
}

import * as THREE from 'three';

// 절차적 텍스처 도구: 타일링 노이즈와, 색·높이·거칠기·발광을 한 번에 그리는 캔버스 묶음.

export function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 주기 px×py로 이어지는 값 노이즈
export function vnoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px;
  const ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
  const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// 타일링 fbm. u, v는 0..1
export function fbm(u, v, px, py, octaves, seed) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * px, v * py, px, py, seed + o * 31);
    norm += amp; amp *= 0.5; px *= 2; py *= 2;
  }
  return sum / norm;
}

export const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function texFrom(canvas, { srgb = false, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

const gray = (v) => { const g = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${g},${g},${g})`; };
const orm = (rough, metal) => `rgb(255,${Math.max(0, Math.min(255, Math.round(rough * 255)))},${Math.max(0, Math.min(255, Math.round(metal * 255)))})`;

// 색(c)·높이(h)·ORM(o: G=거칠기, B=금속성)·발광(e) 캔버스를 같은 좌표로 그린다.
export class Layers {
  constructor(N, { emissive = false } = {}) {
    this.N = N;
    this.cc = mkCanvas(N); this.hc = mkCanvas(N); this.oc = mkCanvas(N); this.ec = emissive ? mkCanvas(N) : null;
    this.c = this.cc.getContext('2d');
    this.h = this.hc.getContext('2d', { willReadFrequently: true });
    this.o = this.oc.getContext('2d');
    this.e = this.ec ? this.ec.getContext('2d') : null;
    this.h.fillStyle = gray(0.5); this.h.fillRect(0, 0, N, N);
    this.o.fillStyle = orm(0.8, 0); this.o.fillRect(0, 0, N, N);
    if (this.e) { this.e.fillStyle = '#000'; this.e.fillRect(0, 0, N, N); }
  }

  // 픽셀 단위 바탕. fn(out, x, y, u, v)가 out.{r,g,b,h,rough,metal}을 채운다.
  fill(fn) {
    const N = this.N;
    const ci = this.c.createImageData(N, N), hi = this.h.createImageData(N, N), oi = this.o.createImageData(N, N);
    const cd = ci.data, hd = hi.data, od = oi.data;
    const o = { r: 128, g: 128, b: 128, h: 0.5, rough: 0.8, metal: 0 };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        o.h = 0.5; o.rough = 0.8; o.metal = 0;
        fn(o, x, y, (x + 0.5) / N, (y + 0.5) / N);
        const i = (y * N + x) * 4;
        cd[i] = o.r; cd[i + 1] = o.g; cd[i + 2] = o.b; cd[i + 3] = 255;
        const hv = o.h * 255;
        hd[i] = hv; hd[i + 1] = hv; hd[i + 2] = hv; hd[i + 3] = 255;
        od[i] = 255; od[i + 1] = o.rough * 255; od[i + 2] = o.metal * 255; od[i + 3] = 255;
      }
    }
    this.c.putImageData(ci, 0, 0); this.h.putImageData(hi, 0, 0); this.o.putImageData(oi, 0, 0);
    return this;
  }

  // 같은 사각형을 각 장에 채운다. 지정하지 않은 장은 건드리지 않는다.
  rect(x, y, w, h, { color, height, rough, metal = 0, emissive, alpha = 1 } = {}) {
    if (color != null) { this.c.globalAlpha = alpha; this.c.fillStyle = color; this.c.fillRect(x, y, w, h); this.c.globalAlpha = 1; }
    if (height != null) { this.h.fillStyle = gray(height); this.h.fillRect(x, y, w, h); }
    if (rough != null) { this.o.fillStyle = orm(rough, metal); this.o.fillRect(x, y, w, h); }
    if (emissive != null && this.e) { this.e.fillStyle = emissive; this.e.fillRect(x, y, w, h); }
    return this;
  }

  // 선(균열·긁힘). pts: [[x,y],...]
  line(pts, { color, height, width = 1, alpha = 1 } = {}) {
    const draw = (ctx, style, a) => {
      ctx.globalAlpha = a; ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke(); ctx.globalAlpha = 1;
    };
    if (color != null) draw(this.c, color, alpha);
    if (height != null) draw(this.h, gray(height), 1);
    return this;
  }

  textures({ normal = 2, aniso = 8 } = {}) {
    const N = this.N;
    const hd = this.h.getImageData(0, 0, N, N).data;
    const hf = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) hf[i] = hd[i * 4] / 255;
    const nc = mkCanvas(N), nx = nc.getContext('2d');
    const img = nx.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) {
      const yu = (y - 1 + N) % N, yd = (y + 1) % N;
      for (let x = 0; x < N; x++) {
        const xl = (x - 1 + N) % N, xr = (x + 1) % N;
        const dx = (hf[y * N + xr] - hf[y * N + xl]) * normal;
        const dy = (hf[yd * N + x] - hf[yu * N + x]) * normal;   // 캔버스 y는 아래로, 텍스처 v는 위로
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const i = (y * N + x) * 4;
        d[i] = (-dx * inv * 0.5 + 0.5) * 255;
        d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
        d[i + 2] = (inv * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    nx.putImageData(img, 0, 0);
    return {
      map: texFrom(this.cc, { srgb: true, aniso }),
      normalMap: texFrom(nc, { aniso }),
      orm: texFrom(this.oc, { aniso }),
      emissiveMap: this.ec ? texFrom(this.ec, { srgb: true, aniso }) : null,
    };
  }
}

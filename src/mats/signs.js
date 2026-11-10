import { mkCanvas, texFrom, hash2 } from './tex.js';

// 한글 간판 아틀라스. 가로 간판은 512×128, 돌출(세로) 간판은 128×512 칸에 그린다.
// 상호는 모두 지어낸 이름이다.

export const HSIGNS = [
  { t: '원조 부대찌개', s: '의정부 본점 · 24시', bg: '#b3131b', fg: '#fff2c9', ac: '#ffd23a' },
  { t: '새벽약국', s: '처방 · 조제', bg: '#f1f6ee', fg: '#0d7a3f', ac: '#0d7a3f', cross: true },
  { t: '다온 편의점', s: '24H OPEN', bg: '#0c6b4f', fg: '#ffffff', ac: '#ffd84a' },
  { t: '스타 PC방', s: '최신 사양 · 금연석', bg: '#101a4a', fg: '#62e0ff', ac: '#ff4fd8' },
  { t: '금성 노래연습장', s: '지하 1층', bg: '#3a0b52', fg: '#ffe95a', ac: '#ff5ab0' },
  { t: '황금치킨 호프', s: '생맥주 · 후라이드', bg: '#f2b21b', fg: '#3a1a00', ac: '#c21a10' },
  { t: '행복공인중개사', s: '매매 · 전세 · 월세', bg: '#f3f3ee', fg: '#1a3fa0', ac: '#d02a2a' },
  { t: '백조세탁', s: '수선 · 드라이', bg: '#1f6fd0', fg: '#ffffff', ac: '#bfe6ff' },
  { t: '챔피언 당구장', s: '3층', bg: '#0e3d24', fg: '#f3e9c0', ac: '#e8452c' },
  { t: '장수한의원', s: '침 · 뜸 · 한약', bg: '#efe8d6', fg: '#3b2412', ac: '#8a1a14' },
  { t: '미소 미용실', s: '펌 · 염색', bg: '#ff7fa8', fg: '#ffffff', ac: '#5a1030' },
  { t: '회룡철물', s: '열쇠 · 공구 · 도장', bg: '#ffe23a', fg: '#101010', ac: '#d01a1a' },
  { t: '엄마손 분식', s: '김밥 · 떡볶이 · 라면', bg: '#ff6a1a', fg: '#ffffff', ac: '#fff0a0' },
  { t: '새서울 정육점', s: '한우 · 한돈', bg: '#c8102e', fg: '#ffffff', ac: '#ffd0d0' },
  { t: '북부수학학원', s: '초 · 중 · 고 전문', bg: '#123a8a', fg: '#ffffff', ac: '#ffd23a' },
  { t: '24시 해장국', s: '선지 · 뼈다귀', bg: '#7a1410', fg: '#ffe9c0', ac: '#ffb020' },
  { t: '휴대폰 할인매장', s: '번호이동 · 기기변경', bg: '#e6007e', fg: '#ffffff', ac: '#ffe600' },
  { t: '회룡 모텔', s: '대실 · 숙박', bg: '#1a1030', fg: '#ff5a7a', ac: '#7a5aff' },
  { t: '한양 사진관', s: '증명 · 여권', bg: '#2a2a2a', fg: '#f0e6d0', ac: '#c0a060' },
  { t: '의정부 새벽시장', s: 'SAEBYEOK MARKET', bg: '#0f4fa8', fg: '#ffffff', ac: '#ffd23a' },
  { t: '대피소', s: '← 지하 50m · SHELTER', bg: '#f2c400', fg: '#101010', ac: '#101010' },
  { t: '통행금지', s: '22:00 – 05:00 · 계엄사령부', bg: '#d8d4c8', fg: '#b01010', ac: '#101010' },
  { t: '검문소', s: '정지 · 시동 끄고 대기', bg: '#f2c400', fg: '#101010', ac: '#b01010' },
  { t: '군 작전 지역', s: '민간인 출입 통제', bg: '#30381f', fg: '#e8e4d0', ac: '#f2c400' },
];
// 이름으로 칸 번호를 찾을 때 쓴다.
export const SIGN = Object.fromEntries(HSIGNS.map((s, i) => [s.t, i]));

export const VSIGNS = [
  { t: '약', bg: '#f1f6ee', fg: '#0d7a3f' },
  { t: 'PC방', bg: '#101a4a', fg: '#62e0ff' },
  { t: '노래방', bg: '#3a0b52', fg: '#ffe95a' },
  { t: '치킨', bg: '#f2b21b', fg: '#3a1a00' },
  { t: '당구', bg: '#0e3d24', fg: '#f3e9c0' },
  { t: '모텔', bg: '#1a1030', fg: '#ff5a7a' },
  { t: '분식', bg: '#ff6a1a', fg: '#ffffff' },
  { t: '한의원', bg: '#efe8d6', fg: '#8a1a14' },
  { t: '학원', bg: '#123a8a', fg: '#ffffff' },
  { t: '미용실', bg: '#ff7fa8', fg: '#ffffff' },
  { t: '호프', bg: '#7a1410', fg: '#ffb020' },
  { t: '세탁', bg: '#1f6fd0', fg: '#ffffff' },
];

const KO_DISPLAY = '"Black Han Sans", "Do Hyeon", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const KO_ROUND = '"Do Hyeon", "Black Han Sans", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const KO_TEXT = '"IBM Plex Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

// 캔버스에 그리기 전에 웹폰트의 필요한 글자 조각을 받아 둔다. 실패하면 시스템 글꼴로 그린다.
export async function loadSignFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const sample = HSIGNS.map((s) => s.t + s.s).join('') + VSIGNS.map((s) => s.t).join('') + '0123456789-·';
  const jobs = ['400 48px "Black Han Sans"', '400 48px "Do Hyeon"', '600 24px "IBM Plex Sans KR"', '500 20px "IBM Plex Mono"']
    .map((f) => document.fonts.load(f, sample).catch(() => null));
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 3500))]);
}

function grime(g, x, y, w, h, seed) {
  // 빗물 자국과 먼지
  for (let i = 0; i < 14; i++) {
    const sx = x + hash2(i, seed, 5) * w, sw = 1 + hash2(i, seed, 6) * 3, sh = h * (0.3 + hash2(i, seed, 7) * 0.7);
    const gr = g.createLinearGradient(0, y, 0, y + sh);
    gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(sx, y, sw, sh);
  }
}

function drawH(g, s, x, y, w, h, i) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = s.bg; g.fillRect(x, y, w, h);
  const sheen = g.createLinearGradient(0, y, 0, y + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.20)');
  g.fillStyle = sheen; g.fillRect(x, y, w, h);

  let tx = x + h * 0.24;
  if (s.cross) {
    // 약국 녹십자
    const cx = x + h * 0.55, cy = y + h * 0.5, a = h * 0.11, b = h * 0.3;
    g.fillStyle = s.ac; g.fillRect(cx - a, cy - b, a * 2, b * 2); g.fillRect(cx - b, cy - a, b * 2, a * 2);
    tx = x + h * 1.05;
  } else if (i % 3 === 0) {
    g.fillStyle = s.ac; g.fillRect(x, y, h * 0.13, h);
    tx = x + h * 0.30;
  } else if (i % 3 === 1) {
    g.fillStyle = s.ac; g.beginPath(); g.arc(x + h * 0.52, y + h * 0.5, h * 0.27, 0, Math.PI * 2); g.fill();
    g.fillStyle = s.bg; g.beginPath(); g.arc(x + h * 0.52, y + h * 0.5, h * 0.15, 0, Math.PI * 2); g.fill();
    tx = x + h * 0.96;
  } else {
    g.fillStyle = s.ac; g.fillRect(x, y + h * 0.9, w, h * 0.1);
  }

  const family = i % 4 === 2 ? KO_ROUND : KO_DISPLAY;
  const maxW = (x + w) - tx - h * 0.2;
  let fs = h * 0.54;
  g.font = `400 ${fs}px ${family}`;
  const tw = g.measureText(s.t).width;
  if (tw > maxW) { fs *= maxW / tw; g.font = `400 ${fs}px ${family}`; }
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(s.t, tx + h * 0.012, y + h * 0.435);
  g.fillStyle = s.fg; g.fillText(s.t, tx, y + h * 0.42);

  g.font = `600 ${h * 0.155}px ${KO_TEXT}`;
  g.fillStyle = s.fg; g.globalAlpha = 0.86; g.fillText(s.s, tx + h * 0.02, y + h * 0.80); g.globalAlpha = 1;
  // 전화번호(가짜)
  const tel = `031-8${String(10 + Math.floor(hash2(i, 3, 11) * 89))}-${String(1000 + Math.floor(hash2(i, 5, 13) * 8999))}`;
  g.font = `500 ${h * 0.13}px "IBM Plex Mono", monospace`;
  g.textAlign = 'right'; g.globalAlpha = 0.8; g.fillText(tel, x + w - h * 0.14, y + h * 0.81); g.globalAlpha = 1;

  // 아크릴 판 이음매와 테두리
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = Math.max(1, h * 0.012);
  for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + (w * k) / 4, y); g.lineTo(x + (w * k) / 4, y + h); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = Math.max(2, h * 0.05); g.strokeRect(x, y, w, h);
  grime(g, x, y, w, h, i + 1);
  g.restore();
}

function drawV(g, s, x, y, w, h, i) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = s.bg; g.fillRect(x, y, w, h);
  const sheen = g.createLinearGradient(x, 0, x + w, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0.08)'); sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = sheen; g.fillRect(x, y, w, h);
  const chars = [...s.t];
  // 'PC방'처럼 로마자가 섞이면 로마자를 한 줄로 묶는다.
  const rows = [];
  let latin = '';
  for (const ch of chars) {
    if (/[A-Za-z0-9]/.test(ch)) latin += ch;
    else { if (latin) { rows.push(latin); latin = ''; } rows.push(ch); }
  }
  if (latin) rows.push(latin);
  const fs = Math.min(w * 0.72, (h * 0.84) / rows.length);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = s.fg;
  rows.forEach((r, k) => {
    let f = fs;
    g.font = `400 ${f}px ${KO_DISPLAY}`;
    const tw = g.measureText(r).width;
    if (tw > w * 0.84) { f *= (w * 0.84) / tw; g.font = `400 ${f}px ${KO_DISPLAY}`; }
    const cy = y + h * 0.5 + (k - (rows.length - 1) / 2) * fs * 1.08;
    g.fillText(r, x + w / 2, cy);
  });
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = Math.max(2, w * 0.05); g.strokeRect(x, y, w, h);
  grime(g, x, y, w, h, i + 40);
  g.restore();
}

const uvRect = (x, y, w, h, size) => {
  const pad = 2;
  return { u0: (x + pad) / size, u1: (x + w - pad) / size, v0: 1 - (y + h - pad) / size, v1: 1 - (y + pad) / size, aspect: w / h };
};

export function buildSignAtlas(size = 2048, aniso = 8) {
  const S = size / 2048;
  const c = mkCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#101010'; g.fillRect(0, 0, size, size);
  const cells = { h: [], v: [] };
  HSIGNS.forEach((s, i) => {
    const x = (i % 4) * 512 * S, y = Math.floor(i / 4) * 128 * S;
    drawH(g, s, x, y, 512 * S, 128 * S, i);
    cells.h.push(uvRect(x, y, 512 * S, 128 * S, size));
  });
  VSIGNS.forEach((s, i) => {
    const x = i * 128 * S, y = 1536 * S;
    drawV(g, s, x, y, 128 * S, 512 * S, i);
    cells.v.push(uvRect(x, y, 128 * S, 512 * S, size));
  });
  return { texture: texFrom(c, { srgb: true, repeat: false, aniso }), cells, canvas: c };
}

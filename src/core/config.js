// 게임 전역 상수와 품질 단계, 사용자 설정 저장.

export const PLAYER = {
  eye: 1.66, crouchEye: 1.05, radius: 0.32, height: 1.8, crouchHeight: 1.25,
  fov: 74, viewFov: 54,
  walk: 4.3, sprint: 6.7, crouch: 2.2, adsMul: 0.55,
  jump: 5.1, gravity: 15.5, step: 0.42, airStep: 0.2,
  health: 100, regenDelay: 4.5, regenRate: 22,
};

export const WEAPON = {
  name: 'K2C3',
  rpm: 760, mag: 30, reserve: 180,
  damage: 34, weakMul: 2.0, range: 220,
  hipSpread: 0.016, adsSpread: 0.0016, moveSpread: 0.022, bloom: 0.006, bloomMax: 0.05,
  recoilPitch: 0.016, recoilYaw: 0.006, adsRecoilMul: 0.62,
  reloadTime: 2.25, adsFov: 50, adsTime: 0.17,
};

// 품질 단계. scale: 내부 해상도 배율, msaa: 다중 샘플 수, shadow: 그림자 지도 한 변,
// tex: 절차적 텍스처 한 변, rain: 빗줄기 밀도, reflect: 젖은 노면 반사 해상도 배율(0 = 끔)
export const QUALITY = {
  test:   { name: 'test',   scale: 1,    msaa: 0, shadow: 1024, tex: 256,  bloom: true, rain: 0.4, reflect: 0.5 },
  low:    { name: 'low',    scale: 0.7,  msaa: 0, shadow: 1024, tex: 512,  bloom: true, rain: 0.5, reflect: 0 },
  medium: { name: 'medium', scale: 0.85, msaa: 2, shadow: 2048, tex: 512,  bloom: true, rain: 0.8, reflect: 0.5 },
  high:   { name: 'high',   scale: 1,    msaa: 4, shadow: 4096, tex: 1024, bloom: true, rain: 1,   reflect: 0.5 },
  ultra:  { name: 'ultra',  scale: 1,    msaa: 4, shadow: 4096, tex: 1024, bloom: true, rain: 1,   reflect: 1 },
};
export const QUALITY_NAMES = ['low', 'medium', 'high', 'ultra'];
export const QUALITY_LABEL = { auto: '자동', low: '낮음', medium: '보통', high: '높음', ultra: '최고', test: '점검' };

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch { return ''; }
}

// '자동'일 때 기기 사정에 맞는 단계를 고른다.
function guessTier() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse && Math.min(screen.width, screen.height) < 820) return 'low';
  const gpu = gpuName().toLowerCase();
  if (!gpu) return 'medium';
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  if (/rtx|gtx|geforce|radeon rx|radeon pro|quadro|\barc\b|apple m\d/.test(gpu)) return 'high';
  if (/intel|uhd|iris|vega|radeon\(tm\)|mali|adreno|powervr|apple gpu/.test(gpu)) return 'medium';
  return (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
}

export function pickQuality(choice) {
  return { ...(QUALITY[choice] || QUALITY[guessTier()]) };
}

const STORE_KEY = 'corridor2030.settings';
export const SETTINGS_DEFAULT = { quality: 'auto', sens: 1, invertY: false, volume: 0.8, fov: PLAYER.fov };
const within = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

export function loadSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* 저장소를 못 쓰는 환경 */ }
  const d = SETTINGS_DEFAULT, s = saved && typeof saved === 'object' ? saved : {};
  return {
    quality: s.quality === 'auto' || QUALITY_NAMES.includes(s.quality) ? s.quality : d.quality,
    sens: within(s.sens, 0.2, 3, d.sens),
    invertY: !!s.invertY,
    volume: within(s.volume, 0, 1, d.volume),
    fov: within(s.fov, 60, 95, d.fov),
  };
}

export function saveSettings(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 무시 */ }
}

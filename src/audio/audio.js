import * as THREE from 'three';

// 오디오: 모든 소리를 Web Audio로 합성한다(음원 파일 없음).
// 부팅 때 파형 버퍼를 계산해 두고, 재생은 버퍼 소스 + 3D 패너 + 컨볼루션 리버브로 처리한다.
// 게임 이벤트(weapon:fire, impact, enemy:fire ...)를 구독해 스스로 소리를 낸다.

const TAU = Math.PI * 2;

export function createAudioStub() {
  const h = { setPos() {}, setGain() {}, setRate() {}, stop() {} };
  return { stub: true, update() {}, resume() {}, play() { return null; }, loop: () => h, setIntensity() {}, setInterior() {}, setVolume() {}, setPaused() {} };
}

export function createAudio(G) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return createAudioStub();
  const ctx = new AC({ latencyHint: 'interactive' });
  const sr = ctx.sampleRate;

  // ---- 작은 DSP 도구 ----
  const arr = (dur) => new Float32Array(Math.max(1, Math.floor(dur * sr)));
  const noise = (d, amp = 1) => { for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * amp; return d; };
  const env = (d, fn) => { for (let i = 0; i < d.length; i++) d[i] *= fn(i / sr); return d; };
  const lp = (d, fc) => { const a = 1 - Math.exp((-TAU * fc) / sr); let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; } return d; };
  const hp = (d, fc) => { const a = 1 - Math.exp((-TAU * fc) / sr); let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] -= y; } return d; };
  const bp = (d, f0, q) => {
    const w = (TAU * f0) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) { const x = d[i], y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y; }
    return d;
  };
  const addTo = (dst, src, gain = 1, at = 0, wrap = false) => {
    const o = Math.floor(at * sr), n = dst.length;
    for (let i = 0; i < src.length; i++) { let k = o + i; if (k >= n) { if (!wrap) break; k %= n; } dst[k] += src[i] * gain; }
    return dst;
  };
  const norm = (d, peak = 0.9) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; } return d; };
  const drive = (d, k) => { for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * k); return d; };
  const toBuffer = (d) => { const b = ctx.createBuffer(1, d.length, sr); b.copyToChannel(d, 0); return b; };
  const mk = (dur, build) => { const d = arr(dur); build(d, d.length); return toBuffer(d); };
  // 끝부분을 처음과 교차 페이드해 이음매 없는 반복음으로 만든다
  const loopBuf = (d, fade) => {
    const f = Math.floor(fade * sr), n = d.length - f, out = new Float32Array(n);
    out.set(d.subarray(0, n));
    for (let i = 0; i < f; i++) { const k = i / f; out[i] = d[i] * k + d[n + i] * (1 - k); }
    return toBuffer(out);
  };
  const burst = (dur, decay, f) => { const d = noise(arr(dur)); env(d, (t) => Math.exp(-t * decay)); if (f) f(d); return d; };
  const tone = (dur, f0, f1, decay, k = 30) => { const d = arr(dur); for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(TAU * (f1 * t + ((f0 - f1) / k) * (1 - Math.exp(-t * k)))) * Math.exp(-t * decay); } return d; };

  const bank = {};

  // ---- 총성 ----
  const mkRifle = (v) => mk(0.6, (d) => {
    const a = burst(0.6, 82, (x) => hp(x, 1650));
    const b = noise(arr(0.6)); env(b, (t) => Math.exp(-t * 19) * (1 - Math.exp(-t * 900))); lp(b, 1050 + v * 170); hp(b, 130);
    const th = tone(0.6, 185, 50, 24, 30);
    for (let i = 0; i < d.length; i++) d[i] = a[i] * 0.9 + b[i] * 1.7 + th[i] * 1.05;
    addTo(d, burst(0.05, 150, (x) => bp(x, 3200, 3)), 0.4, 0.032);
    drive(d, 2.5); norm(d, 0.95);
  });
  bank.rifle = [mkRifle(0), mkRifle(1), mkRifle(2)];
  const mkEnemyShot = (v) => mk(0.4, (d) => {
    const a = burst(0.4, 110, (x) => hp(x, 2100));
    const b = noise(arr(0.4)); env(b, (t) => Math.exp(-t * 34)); bp(b, 780 + v * 120, 1.1);
    const th = tone(0.4, 240, 90, 40, 40);
    for (let i = 0; i < d.length; i++) d[i] = a[i] * 0.8 + b[i] * 1.5 + th[i] * 0.5;
    drive(d, 2.0); norm(d, 0.9);
  });
  bank.enemyShot = [mkEnemyShot(0), mkEnemyShot(1)];
  bank.dry = mk(0.08, (d) => { addTo(d, burst(0.03, 220, (x) => hp(x, 2400))); addTo(d, tone(0.05, 2600, 2400, 120), 0.3); norm(d, 0.5); });
  bank.magout = mk(0.22, (d) => { addTo(d, burst(0.04, 160, (x) => bp(x, 2400, 1.5)), 1); addTo(d, burst(0.12, 30, (x) => { lp(x, 2200); hp(x, 600); }), 0.5, 0.05); addTo(d, tone(0.08, 900, 500, 60), 0.3, 0.05); norm(d, 0.6); });
  bank.magin = mk(0.2, (d) => { addTo(d, tone(0.12, 210, 95, 34), 1); addTo(d, burst(0.035, 190, (x) => bp(x, 1800, 1.2)), 0.9); addTo(d, burst(0.03, 200, (x) => hp(x, 3000)), 0.5, 0.045); norm(d, 0.75); });
  bank.bolt = mk(0.28, (d) => { for (const [t, g] of [[0, 0.8], [0.095, 1]]) { addTo(d, burst(0.04, 150, (x) => hp(x, 1500)), g, t); addTo(d, tone(0.1, 2500, 2300, 60), g * 0.25, t); addTo(d, tone(0.06, 320, 160, 50), g * 0.5, t); } norm(d, 0.8); });
  bank.melee = mk(0.25, (d) => { addTo(d, burst(0.2, 16, (x) => bp(x, 600, 0.8))); env(d, (t) => Math.sin(Math.min(1, t / 0.2) * Math.PI)); norm(d, 0.5); });

  // ---- 발소리, 착지, 피격 ----
  const mkStep = () => mk(0.22, (d) => { addTo(d, burst(0.2, 42, (x) => lp(x, 520)), 1.6); addTo(d, burst(0.12, 30, (x) => hp(x, 2600)), 0.22, 0.01); addTo(d, tone(0.1, 120, 60, 40), 0.6); norm(d, 0.5); });
  bank.step = [mkStep(), mkStep(), mkStep(), mkStep()];
  bank.land = mk(0.4, (d) => { addTo(d, burst(0.4, 18, (x) => lp(x, 380)), 2); addTo(d, tone(0.3, 110, 45, 18), 1); addTo(d, burst(0.2, 26, (x) => hp(x, 2400)), 0.25); norm(d, 0.7); });
  bank.hurt = mk(0.35, (d) => { addTo(d, tone(0.35, 140, 60, 16), 1); addTo(d, burst(0.25, 22, (x) => lp(x, 420)), 1.4); addTo(d, burst(0.03, 140, (x) => bp(x, 1400, 2)), 0.5); drive(d, 1.6); norm(d, 0.8); });
  bank.hit = mk(0.05, (d) => { addTo(d, tone(0.05, 2300, 2100, 90), 1); addTo(d, burst(0.01, 300, (x) => hp(x, 3000)), 0.4); norm(d, 0.35); });
  bank.kill = mk(0.16, (d) => { addTo(d, tone(0.07, 1500, 1400, 60), 1); addTo(d, tone(0.09, 1050, 980, 44), 1, 0.06); norm(d, 0.4); });

  // ---- 피탄, 도비탄 ----
  const mkConcrete = () => mk(0.3, (d) => { addTo(d, burst(0.1, 55, (x) => lp(x, 2600)), 1.2); addTo(d, burst(0.3, 16, (x) => hp(x, 3200)), 0.22); addTo(d, tone(0.06, 300, 120, 60), 0.5); norm(d, 0.8); });
  bank.impact_concrete = [mkConcrete(), mkConcrete(), mkConcrete()];
  const mkMetal = (v) => mk(0.4, (d) => { for (const [f, g, dc] of [[1900 + v * 260, 1, 26], [3150 + v * 180, 0.6, 34], [4700, 0.4, 44], [6300 - v * 300, 0.25, 55]]) addTo(d, tone(0.4, f, f * 0.995, dc), g); addTo(d, burst(0.02, 260, (x) => hp(x, 2500)), 1.2); norm(d, 0.7); });
  bank.impact_metal = [mkMetal(0), mkMetal(1)];
  bank.impact_soft = [mk(0.2, (d) => { addTo(d, burst(0.2, 34, (x) => lp(x, 900)), 1.5); addTo(d, tone(0.1, 160, 70, 40), 0.6); norm(d, 0.6); })];
  bank.ricochet = mk(0.5, (d) => { for (let i = 0; i < d.length; i++) { const t = i / sr, f = 1300 + 2600 * Math.exp(-t * 7); d[i] = Math.sin(TAU * (1300 * t + (2600 / 7) * (1 - Math.exp(-t * 7))) + Math.sin(t * 90) * 1.5) * Math.exp(-t * 8) * (f > 0 ? 1 : 0); } norm(d, 0.35); });
  bank.whiz = mk(0.22, (d) => { const x = noise(arr(0.22)); for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] *= Math.sin(Math.min(1, t / 0.22) * Math.PI) ** 2; } bp(x, 2300, 2.2); addTo(d, x); norm(d, 0.6); });
  bank.shell = mk(0.16, (d) => { for (const [t, g] of [[0, 1], [0.06, 0.5], [0.1, 0.25]]) for (const f of [4300, 6100, 8200]) addTo(d, tone(0.05, f, f, 90), g * 0.4, t); norm(d, 0.3); });

  // ---- 폭발, 포성 ----
  bank.explosion = mk(1.8, (d) => {
    const a = noise(arr(1.8)); env(a, (t) => Math.exp(-t * 3.6)); lp(a, 900); lp(a, 1400);
    const c = burst(0.25, 26, (x) => hp(x, 900));
    const sub = tone(1.2, 95, 32, 5.5, 9);
    for (let i = 0; i < d.length; i++) d[i] = a[i] * 3 + (c[i] || 0) * 0.9 + (sub[i] || 0) * 1.4;
    drive(d, 2.2); norm(d, 0.98);
  });
  bank.artillery = mk(3.2, (d) => { const a = noise(arr(3.2)); env(a, (t) => (1 - Math.exp(-t * 40)) * Math.exp(-t * 2.1)); lp(a, 140); lp(a, 220); addTo(d, a, 3); addTo(d, tone(2.5, 60, 30, 2.4, 4), 1); norm(d, 0.9); });

  // ---- 적 무인기 ----
  bank.drone = (() => {
    const pre = 0.2, d = arr(1 + pre), f = [176, 183, 191, 198], ph = f.map(() => Math.random() * TAU);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let s = 0;
      for (let r = 0; r < 4; r++) for (let h = 1; h <= 7; h++) s += Math.sin(TAU * f[r] * h * t + ph[r] * h) / (h * 1.2);
      d[i] = s * (0.8 + 0.2 * Math.sin(TAU * 9 * t));
    }
    lp(d, 3600); hp(d, 150); norm(d, 0.55);
    return toBuffer(d.subarray(Math.floor(pre * sr)));
  })();
  bank.servo = mk(0.2, (d) => { addTo(d, tone(0.09, 620, 940, 24, 30), 0.25); for (const f of [820, 1470, 2300]) addTo(d, tone(0.12, f, f, 55), 0.3, 0.07); addTo(d, burst(0.1, 40, (x) => lp(x, 320)), 1.3, 0.07); norm(d, 0.55); });
  bank.telegraph = mk(0.24, (d) => { for (const [t, f, len] of [[0, 1400, 0.07], [0.09, 1900, 0.11]]) { const x = arr(len); for (let i = 0; i < x.length; i++) { const tt = i / sr; x[i] = Math.sign(Math.sin(TAU * f * tt)) * Math.exp(-tt * 14) * Math.min(1, tt * 600); } lp(x, 5000); addTo(d, x, 1, t); } norm(d, 0.4); });
  bank.alert = mk(0.5, (d) => { for (let i = 0; i < d.length; i++) { const t = i / sr, s = ((t * 233) % 1) * 2 - 1 + (((t * 247) % 1) * 2 - 1); d[i] = s * Math.min(1, t * 80) * Math.min(1, (0.5 - t) * 30) * (0.6 + 0.4 * Math.sign(Math.sin(TAU * 9 * t))); } lp(d, 2600); norm(d, 0.42); });

  // ---- 교란기 ----
  bank.jammer = (() => {
    const pre = 0.2, d = arr(2 + pre);
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(TAU * 50 * t) * 0.5 + Math.sin(TAU * 100 * t) * 0.34 + Math.sin(TAU * 150 * t) * 0.2 + Math.sin(TAU * 200 * t) * 0.1 + Math.sin(TAU * 5200 * t) * (0.5 + 0.5 * Math.sin(TAU * 8 * t)) * 0.07 + (Math.random() - 0.5) * 0.04; }
    norm(d, 0.5);
    return toBuffer(d.subarray(Math.floor(pre * sr)));
  })();
  bank.jammerDown = mk(1.5, (d) => {
    let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr, f = 40 + 760 * Math.exp(-t * 3.2); ph += (TAU * f) / sr; d[i] = (((ph / TAU) % 1) * 2 - 1) * Math.exp(-t * 1.6) * 0.6; if (Math.random() < 0.0016 * Math.exp(-t * 1.2)) d[i] += (Math.random() - 0.5) * 3; }
    lp(d, 2400); norm(d, 0.8);
  });
  bank.tick = mk(0.04, (d) => { addTo(d, tone(0.04, 1800, 1700, 110), 1); norm(d, 0.3); });

  // ---- UI, 무전 ----
  bank.uiClick = mk(0.07, (d) => { addTo(d, tone(0.07, 880, 820, 70), 1); addTo(d, burst(0.01, 300, (x) => hp(x, 3000)), 0.4); norm(d, 0.3); });
  bank.uiHover = mk(0.035, (d) => { addTo(d, tone(0.035, 1500, 1450, 120), 1); norm(d, 0.14); });
  bank.radio = mk(0.16, (d) => { const x = noise(arr(0.16)); env(x, (t) => Math.min(1, t * 200) * Math.min(1, (0.16 - t) * 60)); bp(x, 2100, 1.2); addTo(d, x, 1); addTo(d, tone(0.03, 1200, 1200, 20), 0.5); norm(d, 0.3); });

  // ---- 환경음(반복) ----
  bank.rain = (() => {
    const dur = 5, d = noise(arr(dur));
    bp(d, 2700, 0.5); hp(d, 500);
    addTo(d, lp(noise(arr(dur)), 380), 0.6);
    for (let k = 0; k < 160; k++) addTo(d, tone(0.02, 2400 + Math.random() * 3000, 1800, 160), 0.25 * Math.random(), Math.random() * (dur - 0.1));
    norm(d, 0.5);
    return loopBuf(d, 0.6);
  })();
  bank.wind = (() => { const dur = 7, d = noise(arr(dur)); lp(d, 240); lp(d, 420); env(d, (t) => 0.6 + 0.4 * Math.sin((TAU * t) / 6.2)); norm(d, 0.6); return loopBuf(d, 0.8); })();
  bank.siren = (() => {
    const dur = 12.4, d = arr(dur);
    let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr, f = 440 + 170 * Math.sin((TAU * t) / 12 - Math.PI / 2); ph += (TAU * f) / sr; d[i] = Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph); }
    lp(d, 1500); norm(d, 0.5);
    return loopBuf(d, 0.4);
  })();

  // ---- 음악: 낮은 패드 + 전투 박동 ----
  bank.pad = (() => {
    const dur = 8, pre = 0.25, d = arr(dur + pre), q = (f) => Math.round(f * 8) / 8;
    const notes = [q(73.42), q(110), q(146.83), q(174.61)];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let s = 0;
      for (let k = 0; k < notes.length; k++) for (const det of [-0.125, 0.125]) { const f = notes[k] + det; for (let h = 1; h <= 5; h++) s += Math.sin(TAU * f * h * t + k * 1.7 + h) / (h * h * 0.8); }
      d[i] = s * (0.7 + 0.3 * Math.sin((TAU * t) / 8));
    }
    lp(d, 520); hp(d, 40); norm(d, 0.55);
    return toBuffer(d.subarray(Math.floor(pre * sr)));
  })();
  bank.pulse = (() => {
    const beat = 0.6, d = arr(beat * 8);
    const hitA = arr(0.5); addTo(hitA, tone(0.5, 82, 40, 9, 22), 1); addTo(hitA, burst(0.2, 30, (x) => lp(x, 260)), 1.2);
    for (const b of [0, 1.5, 3, 4, 5.5, 7]) addTo(d, hitA, b === 0 || b === 4 ? 1 : 0.7, b * beat, true);
    const tk = burst(0.05, 90, (x) => hp(x, 7000));
    for (let k = 0; k < 16; k++) addTo(d, tk, k % 2 ? 0.1 : 0.05, k * beat * 0.5, true);
    const bass = arr(0.14); for (let i = 0; i < bass.length; i++) { const t = i / sr; bass[i] = (((t * 36.75) % 1) * 2 - 1) * Math.exp(-t * 16); } lp(bass, 240);
    for (let k = 0; k < 32; k++) if (k % 8 !== 7) addTo(d, bass, 0.5, k * beat * 0.25, true);
    drive(d, 1.4); norm(d, 0.8);
    return toBuffer(d);
  })();

  // ---- 잔향 임펄스 응답(거리, 실내) ----
  const mkIR = (dur, decay, cutoff, echoes) => {
    const n = Math.floor(dur * sr), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = noise(new Float32Array(n));
      env(d, (t) => Math.exp(-t * decay) * Math.min(1, t / 0.008));
      lp(d, cutoff);
      for (const [time, gain] of echoes) { const o = Math.floor((time + ch * 0.0037) * sr); for (let k = 0; k < 260 && o + k < n; k++) d[o + k] += (Math.random() * 2 - 1) * gain * Math.exp(-k / 46); }
      norm(d, 0.5);
      b.copyToChannel(d, ch);
    }
    return b;
  };
  const irStreet = mkIR(2.1, 2.9, 3800, [[0.052, 0.9], [0.094, 0.7], [0.163, 0.6], [0.247, 0.45], [0.41, 0.3]]);
  const irInside = mkIR(1.0, 6.5, 5200, [[0.018, 0.9], [0.031, 0.8], [0.047, 0.6]]);

  // ---- 그래프 ----
  const master = ctx.createGain();
  master.gain.value = G.settings ? G.settings.volume : 0.8;
  master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -15; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
  comp.connect(master);
  const sfx = ctx.createGain(); sfx.connect(comp);
  const reverb = ctx.createConvolver(); reverb.buffer = irStreet;
  const reverbOut = ctx.createGain(); reverbOut.gain.value = 0.5;
  reverb.connect(reverbOut); reverbOut.connect(comp);
  const ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 16000;
  const amb = ctx.createGain(); amb.gain.value = 1;
  amb.connect(ambFilter); ambFilter.connect(comp);
  const music = ctx.createGain(); music.gain.value = 0.55; music.connect(master);

  const setPannerPos = (p, v) => {
    if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
  };
  const mkPanner = (o) => {
    const p = ctx.createPanner();
    p.panningModel = o.hrtf === false ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse'; p.refDistance = o.ref ?? 4; p.maxDistance = 160; p.rolloffFactor = o.rolloff ?? 1.3;
    setPannerPos(p, o.pos);
    return p;
  };

  function play(name, o = {}) {
    if (ctx.state !== 'running') return null;
    const item = bank[name];
    if (!item) return null;
    const src = ctx.createBufferSource();
    src.buffer = Array.isArray(item) ? item[(Math.random() * item.length) | 0] : item;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * (o.jitter ?? 0.06));
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g);
    let out = g;
    if (o.pos) { out = mkPanner(o); g.connect(out); }
    out.connect(o.bus ?? sfx);
    if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; out.connect(s); s.connect(reverb); }
    src.start(ctx.currentTime + (o.delay ?? 0));
    return src;
  }

  function loop(name, o = {}) {
    const src = ctx.createBufferSource();
    src.buffer = bank[name]; src.loop = true; src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g);
    let p = null;
    if (o.pos) { p = mkPanner(o); g.connect(p); p.connect(o.bus ?? sfx); } else g.connect(o.bus ?? sfx);
    src.start();
    // 매 프레임 불려도 값이 눈에 띄게 바뀔 때만 예약한다(자동화 이벤트가 쌓이지 않게).
    let stopped = false, gainNow = o.gain ?? 1, rateNow = o.rate ?? 1;
    return {
      setPos(v) { if (p) setPannerPos(p, v); },
      setGain(v, tc = 0.08) { if (stopped || Math.abs(v - gainNow) < 0.01) return; gainNow = v; g.gain.setTargetAtTime(v, ctx.currentTime, tc); },
      setRate(v) { if (stopped || Math.abs(v - rateNow) < 0.01) return; rateNow = v; src.playbackRate.setTargetAtTime(v, ctx.currentTime, 0.1); },
      stop(fade = 0.15) { if (stopped) return; stopped = true; g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); try { src.stop(ctx.currentTime + fade + 0.05); } catch { /* 무시 */ } },
    };
  }

  // 항상 깔리는 소리
  const rainLoop = loop('rain', { gain: 0.55, bus: amb });
  loop('wind', { gain: 0.5, bus: amb });
  const sirenSrc = loop('siren', { gain: 0.0, bus: amb });
  const padLoop = loop('pad', { gain: 0.5, bus: music });
  const pulseLoop = loop('pulse', { gain: 0, bus: music });
  { const s = ctx.createGain(); s.gain.value = 0.9; amb.connect(s); s.connect(reverb); }

  let intensity = 0, intensityTarget = 0, interior = false, sirenT = 6, stepFlip = 0;
  const ev = G.events, cam = G.camera;
  const fwd = new THREE.Vector3(0, 0, -1);

  // ---- 이벤트 → 소리 ----
  ev.on('weapon/shot', () => play('rifle', { gain: 0.85, send: interior ? 0.9 : 0.6, jitter: 0.05 }));
  ev.on('weapon/empty', () => play('dry', { gain: 0.8 }));
  ev.on('weapon/reload', (e) => play(e.phase === 'magout' ? 'magout' : e.phase === 'magin' ? 'magin' : 'bolt', { gain: 0.8 }));
  ev.on('weapon/melee', () => play('melee', { gain: 0.8 }));
  ev.on('player/step', (e) => { stepFlip ^= 1; play('step', { gain: e.sprint ? 0.5 : e.crouch ? 0.16 : 0.3, rate: stepFlip ? 1 : 0.92, jitter: 0.12 }); });
  ev.on('player/land', (e) => play('land', { gain: Math.min(1, 0.3 + e.speed * 0.06) }));
  ev.on('player/jump', () => play('step', { gain: 0.3, rate: 1.2 }));
  ev.on('player/hurt', () => play('hurt', { gain: 0.9, jitter: 0.1 }));
  ev.on('player/scored', (e) => play(e.kill ? 'kill' : 'hit', { gain: e.weak ? 1.0 : 0.8, rate: e.weak ? 1.25 : 1, jitter: 0 }));
  ev.on('world/impact', (e) => {
    if (e.quiet) return;
    const s = e.surface, name = s === 'metal' || s === 'enemy' ? 'impact_metal' : s === 'sand' || s === 'cloth' || s === 'wood' ? 'impact_soft' : 'impact_concrete';
    play(name, { pos: e.point, gain: 0.9, hrtf: false, ref: 5, send: 0.25, jitter: 0.2 });
    if (s === 'metal' && Math.random() < 0.3) play('ricochet', { pos: e.point, gain: 0.5, hrtf: false, ref: 6, jitter: 0.3 });
  });
  ev.on('enemy/shot', (e) => play('enemyShot', { pos: e.pos, gain: 1.6, ref: 7, rolloff: 1.1, send: 0.5, jitter: 0.08 }));
  ev.on('enemy/nearmiss', (e) => play('whiz', { pos: e.pos, gain: 0.9, hrtf: false, ref: 2, jitter: 0.3 }));
  ev.on('enemy/aiming', (e) => play('telegraph', { pos: e.pos, gain: 0.9, ref: 7, rolloff: 1.0 }));
  ev.on('enemy/spotted', (e) => play('alert', { pos: e.pos, gain: 0.8, ref: 8, rolloff: 1.0, send: 0.3 }));
  ev.on('enemy/step', (e) => play('servo', { pos: e.pos, gain: 0.7, ref: 4, jitter: 0.15 }));
  ev.on('enemy/down', (e) => play('explosion', { pos: e.pos, gain: e.type === 'drone' ? 1.4 : 1.8, ref: 9, rolloff: 1.0, send: 0.6, jitter: 0.12 }));
  ev.on('casing/drop', (e) => play('shell', { pos: e.pos, gain: 0.35, hrtf: false, ref: 1.5, jitter: 0.25 }));
  ev.on('jammer/tick', (e) => play('tick', { gain: 0.5, rate: 0.8 + e.progress * 0.6, jitter: 0 }));
  ev.on('jammer/cut', (e) => play('jammerDown', { pos: e.pos, gain: 1.6, ref: 6, send: 0.5, jitter: 0 }));
  ev.on('radio/line', () => play('radio', { gain: 0.5, jitter: 0.04 }));
  ev.on('ui/click', () => play('uiClick', { gain: 0.6, jitter: 0 }));
  ev.on('ui/hover', () => play('uiHover', { gain: 0.5, jitter: 0 }));
  ev.on('sky/flash', (e) => play('artillery', { gain: 0.16 + e.intensity * 0.2, delay: 1.4 + Math.random() * 2.6, send: 0.9, jitter: 0.3, rate: 0.8 }));

  return {
    ctx, bank, play, loop,
    resume() { if (ctx.state !== 'running') ctx.resume().catch(() => {}); },
    setPaused(p) { if (p) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); } else if (ctx.state !== 'running') ctx.resume().catch(() => {}); },
    setVolume(v) { master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    setIntensity(v) { intensityTarget = Math.max(0, Math.min(1, v)); },
    setInterior(v) {
      if (v === interior) return;
      interior = v;
      reverb.buffer = v ? irInside : irStreet;
      ambFilter.frequency.setTargetAtTime(v ? 1100 : 16000, ctx.currentTime, 0.25);
      rainLoop.setGain(v ? 0.4 : 0.55, 0.3);
    },
    update(dt) {
      if (ctx.state !== 'running') return;
      // 청취자 = 카메라
      const L = ctx.listener, p = cam.position;
      cam.getWorldDirection(fwd);
      if (L.positionX) {
        L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
        L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
      intensity += (intensityTarget - intensity) * Math.min(1, dt * (intensityTarget > intensity ? 1.6 : 0.35));
      pulseLoop.setGain(intensity * 0.75, 0.1);
      padLoop.setGain(0.5 + intensity * 0.15, 0.2);
      // 먼 공습 사이렌이 이따금 들렸다 사라진다
      sirenT -= dt;
      if (sirenT <= 0) { sirenT = 38 + Math.random() * 30; sirenSrc.setGain(0.05, 3); setTimeout(() => sirenSrc.setGain(0, 5), 16000); }
    },
  };
}

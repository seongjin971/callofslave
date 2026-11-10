import * as THREE from 'three';
import './ui/ui.css';
import { createEvents, createRng } from './core/util.js';
import { pickQuality, loadSettings } from './core/config.js';
import { createRender } from './render/render.js';
import { createMaterials } from './mats/materials.js';
import { createPhysics } from './world/physics.js';
import { createLevel } from './world/level.js';
import { createFx } from './fx/fx.js';
import { createAudio, createAudioStub } from './audio/audio.js';
import { createInput } from './game/input.js';
import { createPlayer } from './game/player.js';
import { createWeapon } from './game/weapon.js';
import { createEnemies } from './game/enemies.js';
import { createHud } from './ui/hud.js';
import { createMenu } from './ui/menu.js';
import { createGame } from './game/game.js';

// 진입점. 모듈을 차례로 올리고 프레임 순서를 정한다.
// 주소 옵션: ?q=low|medium|high|ultra  ?seed=숫자  ?mute  ?go(표지 건너뛰기)  ?god
//            ?shot(점검용: 낮은 해상도 텍스처, 마우스 고정 안 함)  ?cam=x,y,z,lx,ly,lz(고정 시점)  ?exposure=값
// 점검용 전역: window.__corridor { G, ready, frames, errors, stats(), step(n, dt), cam(...) }

const probe = (window.__corridor = { G: null, ready: false, frames: 0, errors: [], fatal: null });
const remember = (text) => { if (probe.errors.length < 60) probe.errors.push(String(text).slice(0, 600)); };
window.addEventListener('error', (e) => remember(e.message));
window.addEventListener('unhandledrejection', (e) => remember('promise: ' + ((e.reason && e.reason.message) || e.reason)));
{
  const original = console.error.bind(console);
  console.error = (...args) => { remember(args.map((x) => (x && x.stack) || x).join(' ')); original(...args); };
}

const bootEl = document.getElementById('boot'), logEl = document.getElementById('boot-log'), fillEl = document.getElementById('boot-fill'), pctEl = document.getElementById('boot-pct');
const meter = (ratio) => { const p = Math.round(ratio * 100); fillEl.style.width = p + '%'; pctEl.textContent = p + '%'; };
async function stage(text, ratio) {
  for (const d of logEl.children) d.classList.remove('now');
  const line = document.createElement('div');
  line.className = 'now'; line.textContent = text;
  logEl.appendChild(line);
  meter(ratio);
  await new Promise((r) => setTimeout(r, 0));          // 화면이 한 번 그려지게 양보
}
function crash(err) {
  probe.fatal = String(err);
  console.error('[boot] ' + err);
  const box = document.createElement('div');
  box.id = 'crash';
  box.textContent = '시작하지 못했습니다.\n' + err;
  document.getElementById('app').appendChild(box);
}

async function main() {
  const params = Object.fromEntries(new URLSearchParams(location.search));
  const settings = loadSettings();
  const G = {
    THREE, params, settings,
    events: createEvents(),
    rng: createRng(Number(params.seed) || 2030),
    time: { t: 0, dt: 0, frame: 0 },
    quality: pickQuality(params.q || (params.shot !== undefined ? 'test' : settings.quality)),
  };
  probe.G = G;

  await stage('화면 준비', 0.04);
  G.render = createRender(G);
  G.renderer = G.render.renderer; G.scene = G.render.scene; G.camera = G.render.camera; G.viewCamera = G.render.viewCamera;

  await stage('재질 생성', 0.1);
  G.mats = await createMaterials(G, (v) => meter(0.1 + v * 0.42));

  await stage('거리 조립', 0.54);
  G.physics = createPhysics(G);
  G.level = createLevel(G);

  await stage('효과와 음향 준비', 0.7);
  G.fx = createFx(G);
  G.audio = createAudioStub();
  if (params.mute === undefined) { try { G.audio = createAudio(G); } catch (err) { console.error('[boot] 음향을 켜지 못해 무음으로 진행: ' + ((err && err.stack) || err)); } }

  await stage('장비 점검', 0.82);
  G.input = createInput(G);
  G.player = createPlayer(G);
  G.player.god = params.god !== undefined;
  G.weapon = createWeapon(G);

  await stage('적 배치', 0.9);
  G.enemies = createEnemies(G);
  G.hud = createHud(G);
  G.menu = createMenu(G);
  G.game = createGame(G);

  await stage('준비 완료', 1);
  G.game.title();
  if (params.go !== undefined || params.shot !== undefined) G.game.deploy({ quiet: true });

  // 한 모듈의 오류가 프레임 전체를 멈추지 않게 감싼다. 같은 오류는 한 번만 기록한다.
  const failed = new Set();
  const guard = (name, fn) => {
    try { return fn(); } catch (err) {
      if (!failed.has(name)) { failed.add(name); console.error(`[frame] ${name}: ${(err && err.stack) || err}`); }
      return undefined;
    }
  };

  let fixed = null;      // 고정 시점(점검용)
  probe.cam = (x, y, z, lx = 0, ly = 1.5, lz = 0) => { fixed = x === undefined ? null : { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) }; };
  if (params.cam) probe.cam(...String(params.cam).split(',').map(Number));
  if (params.exposure) G.render.exposure = Number(params.exposure);

  function frame(dt) {
    G.time.dt = dt; G.time.t += dt; G.time.frame++;
    guard('input', () => G.input.update(dt));
    const simulate = guard('game', () => G.game.update(dt)) === true;
    if (simulate) {
      guard('player', () => G.player.update(dt));
      guard('weapon', () => G.weapon.update(dt));
      guard('enemies', () => G.enemies.update(dt));
    }
    if (G.game.state !== 'paused') {
      guard('fx', () => G.fx.update(dt));
      guard('level', () => G.level.update(dt));
      guard('mats', () => G.mats.update(dt));
    }
    guard('audio', () => G.audio.update(dt));
    guard('hud', () => G.hud.update(dt));
    if (fixed) { G.camera.position.copy(fixed.pos); G.camera.lookAt(fixed.look); }
    guard('render', () => G.render.frame(dt));
    G.input.endFrame();
    probe.frames++;
  }

  let smooth = 0;
  probe.stats = () => ({ ...G.render.stats(), fps: smooth ? Math.round(10 / smooth) / 10 : 0, state: G.game.state, enemies: G.enemies.aliveCount(), quality: G.quality.name });
  probe.step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); return probe.stats(); };

  bootEl.classList.add('gone');
  setTimeout(() => { bootEl.hidden = true; }, 900);

  let prev = performance.now();
  G.renderer.setAnimationLoop(() => {
    const now = performance.now(), elapsed = (now - prev) / 1000;
    prev = now;
    smooth = smooth ? smooth * 0.94 + elapsed * 0.06 : elapsed;
    frame(Math.min(elapsed, 0.05));
    if (probe.frames >= 2) probe.ready = true;
  });
}

main().catch((err) => crash((err && err.stack) || err));

import * as THREE from 'three';
import { smoothstep, damp } from '../core/util.js';

// 임무 진행: 표지 → 투입 → 교란기 3기 차단 → 회수 지점 이탈 → 결과 보고.
// 적 증원, 무전, 재투입(끊어 둔 교란기는 유지), 통계와 평가를 맡는다.

const HQ = '불암';
const SCRIPT = {
  start: [
    '백호, 불암이다. 새벽시장 일대에 적 교란 장비 셋이 깔렸다. 드론도 포병 관측도 먹통이다.',
    'A, B, C 순서는 상관없다. 전원을 내려라. 그러면 우리가 다시 볼 수 있다.',
  ],
  contact: ['적 무인기가 널 봤다. 눈에 붉은 불이 들어오면 곧 쏜다. 그 전에 엄폐해.'],
  cut1: ['첫 번째 꺼졌다. 관측 영상이 조금 돌아왔다. 계속 가라.'],
  cut2: ['두 번째 확인. 마지막 한 대다. 증원이 그쪽으로 붙고 있으니 서둘러.'],
  cut3: ['교란 전부 꺼졌다. 포대가 좌표를 받기 시작했다. 남동쪽 공터에 장갑차가 대기 중이다.'],
  hurt: ['백호, 생체 신호가 떨어진다. 벽 뒤로 빠져서 호흡부터 잡아라.'],
  retry: ['백호 재진입 확인. 끊어 놓은 건 그대로다. 남은 것만 처리해.'],
  done: ['백호 탑승 확인. 오늘 회랑은 넘어가지 않았다. 복귀한다.'],
};
// 교란기를 하나 끊을 때마다 들어오는 증원 규모
const REINFORCE = [null, { drone: 2, jackal: 1 }, { drone: 3, jackal: 2 }, { drone: 2, jackal: 2 }];
const ALIVE_CAP = 10;
const HOLD_SECONDS = 2.6;         // 교란기 차단에 걸리는 시간
const VERB = { drone: '격추', jackal: '파괴' };

export function createGame(G) {
  const bus = G.events, level = G.level, player = G.player, enemies = G.enemies, hud = G.hud, menu = G.menu, fx = G.fx, audio = G.audio, input = G.input, weapon = G.weapon, cam = G.camera;
  const total = level.objectives.length;
  const stats = { time: 0, shots: 0, hits: 0, kills: 0, retries: 0, damage: 0 };
  const hums = new Map(), queue = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), aim = new THREE.Vector3();
  let hold = 0, beep = 0, downFor = 0, downShown = false, tour = 0, veil = 1, veilTo = 0;
  let metEnemy = false, warnedHurt = false, lastCut = null, smoke = null, hinted = false;

  const radio = (key) => { for (const line of SCRIPT[key]) hud.say(HQ, line); };

  function placeGuards() {
    for (const s of level.guards) {
      const jam = s.zone && level.objectives.find((o) => o.id === s.zone);
      if (jam && !jam.active) continue;            // 이미 끊은 구역은 비워 둔다
      enemies.spawn(s.type, s.pos, { patrol: s.patrol, zone: s.zone });
    }
  }
  function restartHums() {
    for (const h of hums.values()) h.stop(0.05);
    hums.clear();
    for (const j of level.objectives) if (j.active) hums.set(j.id, audio.loop('jammer', { pos: j.pos, gain: 0.7, ref: 3, rolloff: 1.7 }));
  }
  function listTargets() {
    hud.setTargets([
      ...level.objectives.map((j) => ({ id: j.id, letter: j.label, name: '교란기', pos: j.top })),
      { id: 'exit', letter: 'X', name: '회수 지점', pos: level.extraction.pos.clone().setY(2.2), kind: 'exit' },
    ]);
    for (const j of level.objectives) if (!j.active) hud.targetDone(j.id);
    if (g.cut >= total) hud.openTarget('exit');
  }
  function rebuild(spawn) {
    fx.clear(); enemies.clear(); queue.length = 0;
    placeGuards();
    player.reset(spawn); weapon.reset();
    hold = 0; downFor = 0; downShown = false; warnedHurt = false;
    hud.action(null); hud.hush();
    listTargets(); restartHums();
    G.render.state.damage = 0;
  }
  function enterPlay() {
    g.state = 'playing';
    menu.close(); hud.show(true); weapon.setVisible(true);
    player.enabled = true; input.enabled = true;
    audio.resume(); audio.setPaused(false);
    if (!G.params.shot) input.requestLock();
    veil = 1; veilTo = 0;
  }

  // 증원: 플레이어에게서 멀고 보이지 않는 진입점을 고른다
  function reinforce(wave) {
    const P = player.pos;
    let room = ALIVE_CAP - enemies.aliveCount();
    const choose = (points, minDist, mustHide) => {
      let c = points.map((p) => ({ p, d: Math.hypot(p[0] - P.x, p[2] - P.z) })).filter((x) => x.d > minDist);
      if (mustHide) { const hidden = c.filter((x) => !G.physics.lineOfSight(a.set(x.p[0], 1, x.p[2]), player.eye)); if (hidden.length) c = hidden; }
      c.sort((x, y) => x.d - y.d);
      return c.length ? c[Math.floor(Math.random() * Math.min(3, c.length))].p : null;
    };
    for (let i = 0; i < wave.drone && room > 0; i++, room--) { const p = choose(level.waveSpawns.drone, 18, false); if (p) enemies.spawn('drone', [p[0] + Math.random() * 3, p[1], p[2] + Math.random() * 3], { engage: true }); }
    for (let i = 0; i < wave.jackal && room > 0; i++, room--) { const p = choose(level.waveSpawns.jackal, 20, true); if (p) enemies.spawn('jackal', [p[0] + Math.random(), 0, p[2] + Math.random()], { engage: true }); }
    hud.banner('적 증원 접근');
  }

  function cut(jam) {
    jam.cut(); g.cut++; lastCut = jam; hold = 0;
    const h = hums.get(jam.id);
    if (h) { h.stop(0.4); hums.delete(jam.id); }
    fx.sparks(jam.sparkPos, { x: 0, y: 1, z: 0 }, 26, { speed: 6, color: [0.7, 0.85, 1.0] });
    fx.addEmitter('sparks', jam.sparkPos, { ttl: 6, rate: 3, temp: true });
    fx.addEmitter('smoke', jam.top.clone().setY(1.9), { ttl: 14, rate: 4, size: 0.3, temp: true });
    G.render.flash(jam.sparkPos, 0x9fd0ff, 40, 12, 0.3);
    bus.emit('jammer/cut', { id: jam.id, pos: jam.pos, count: g.cut });
    hud.targetDone(jam.id);
    hud.log(`교란기 ${jam.label}`, '차단');
    radio('cut' + g.cut);
    if (REINFORCE[g.cut]) queue.push({ wait: 3.2, wave: REINFORCE[g.cut] });
    if (g.cut >= total) {
      level.extraction.activate(true);
      smoke = fx.addEmitter('signal', level.extraction.pos.clone().setY(0.2));
      hud.mission('회수 지점으로 이탈');
      hud.openTarget('exit');
    } else {
      hud.mission(`전파교란기 차단 · 남은 ${total - g.cut}기`);
    }
  }

  function useJammer(dt) {
    let near = null, best = 2.7;
    for (const j of level.objectives) {
      if (!j.active) continue;
      const d = a.copy(j.interactPos).sub(player.eye).length();
      if (d < best && a.normalize().dot(player.forward) > 0.25) { best = d; near = j; }
    }
    if (!near) { hold = Math.max(0, hold - dt * 2); hud.action(null); return; }
    if (input.interact) {
      hold += dt / HOLD_SECONDS;
      if ((beep -= dt) <= 0) { beep = 0.16; bus.emit('jammer/tick', { progress: hold }); }
      if (hold >= 1) { cut(near); hud.action(null); return; }
    } else hold = Math.max(0, hold - dt * 1.4);
    hud.action(`길게 눌러 교란기 ${near.label} 전원 차단`, hold, input.interact);
  }

  // 표지 화면: 거리를 천천히 훑어보는 카메라
  function flyThrough(dt) {
    const pts = level.cinematicPath, leg = 11, span = (pts.length - 1) * leg;
    tour += dt;
    const u = (tour % (span * 2)) / span, f = (u <= 1 ? u : 2 - u) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), k = smoothstep(0, 1, f - i);
    cam.position.copy(a.fromArray(pts[i].pos).lerp(b.fromArray(pts[i + 1].pos), k));
    cam.lookAt(aim.fromArray(pts[i].look).lerp(b.fromArray(pts[i + 1].look), k));
    if (Math.abs(cam.fov - 58) > 0.01) { cam.fov = 58; cam.updateProjectionMatrix(); }
  }

  // 사격 등급식 평가
  function grade(accuracy) {
    const score = 100 - stats.retries * 20 - Math.max(0, stats.time - 420) / 9 - stats.damage / 20 + (accuracy - 0.3) * 45;
    return score >= 88 ? '특급' : score >= 66 ? '1급' : score >= 42 ? '2급' : '3급';
  }

  const g = {
    state: 'title', stats, cut: 0,

    title() {
      g.state = 'title';
      hud.show(false); weapon.setVisible(false);
      player.enabled = false; input.enabled = false;
      menu.open('title');
      veil = 1; veilTo = 0;
    },
    deploy(o = {}) {
      Object.assign(stats, { time: 0, shots: 0, hits: 0, kills: 0, retries: 0, damage: 0 });
      g.cut = 0; lastCut = null; metEnemy = false;
      for (const j of level.objectives) j.reset();
      level.extraction.activate(false);
      if (smoke) { smoke.stop(); smoke = null; }
      rebuild(level.playerStart);
      hud.mission('전파교란기 3기 차단');
      enterPlay();
      if (!o.quiet) { hud.intro('의정부 · 새벽시장 뒷골목', '2030. 3. 9. 04:12 — 작전 〈샛길〉'); radio('start'); }
    },
    retry() {
      stats.retries++;
      let spawn = level.playerStart;
      if (lastCut) {
        // 마지막으로 끊은 교란기 앞에서 다시 시작한다
        const p = lastCut.interactPos;
        spawn = { pos: new THREE.Vector3(p.x, 0, p.z), yaw: Math.atan2(-(p.x - lastCut.pos.x), -(p.z - lastCut.pos.z)) };
      }
      rebuild(spawn);
      enterPlay();
      radio('retry');
    },
    pause() {
      if (g.state !== 'playing') return;
      g.state = 'paused';
      input.exitLock(); input.enabled = false;
      audio.setPaused(true);
      hud.show(false);
      menu.open('pause');
    },
    resume() { if (g.state === 'paused') enterPlay(); },
    finish() {
      g.state = 'done';
      player.enabled = false; input.exitLock(); input.enabled = false;
      audio.setIntensity(0);
      radio('done');
      const accuracy = stats.shots ? stats.hits / stats.shots : 0;
      setTimeout(() => {
        if (g.state !== 'done') return;
        weapon.setVisible(false); hud.show(false);
        menu.open('done', { grade: grade(accuracy), time: stats.time, accuracy, kills: stats.kills, retries: stats.retries });
      }, 1800);
    },

    // 반환값: 이번 프레임에 플레이어·적 시뮬레이션을 돌릴지
    update(dt) {
      veil = damp(veil, veilTo, 2.2, dt);
      G.render.state.fade = veil < 0.004 ? 0 : veil;
      if (g.state === 'title') { flyThrough(dt); return false; }
      if (g.state === 'paused') return false;

      if (g.state === 'playing') {
        stats.time += dt;
        useJammer(dt);
        if (input.pausePressed) { g.pause(); return false; }
        for (let i = queue.length - 1; i >= 0; i--) if ((queue[i].wait -= dt) <= 0) { reinforce(queue[i].wave); queue.splice(i, 1); }
        const ex = level.extraction;
        if (ex.active && Math.hypot(player.pos.x - ex.pos.x, player.pos.z - ex.pos.z) < ex.radius) { g.finish(); return true; }
        audio.setIntensity(enemies.engagedCount() > 0 ? 1 : 0);
        audio.setInterior(level.isInterior(player.eye));
        if (player.health < 35 && !warnedHurt) { warnedHurt = true; radio('hurt'); }
        if (player.health > 80) warnedHurt = false;
        if (input.lockFailed && !hinted) { hinted = true; hud.note('마우스 버튼을 누른 채 끌면 시점이 움직입니다', 6); }
      } else if (g.state === 'down') {
        downFor += dt;
        if (downFor > 1.7 && !downShown) { downShown = true; weapon.setVisible(false); hud.show(false); menu.open('dead', { time: stats.time, cut: g.cut }); }
      }
      return true;
    },
  };

  bus.on('weapon/shot', () => { stats.shots++; });
  bus.on('player/scored', (e) => { stats.hits++; hud.hit(e.kill ? 'fatal' : e.weak ? 'crit' : ''); });
  bus.on('enemy/down', (e) => { stats.kills++; hud.log(e.name, VERB[e.type] || '격파'); });
  bus.on('enemy/spotted', () => { if (!metEnemy && g.state === 'playing') { metEnemy = true; radio('contact'); } });
  bus.on('player/hurt', (e) => { stats.damage += e.amount; if (e.from) hud.hurtFrom(e.from); });
  bus.on('player/down', () => {
    if (g.state !== 'playing') return;
    g.state = 'down'; downFor = 0; downShown = false;
    input.exitLock(); input.enabled = false;
    audio.setIntensity(0);
    hud.action(null);
  });
  // 마우스 고정이 풀리면(Esc 등) 일시 정지한다
  bus.on('input/lock', (e) => { if (e.lost && g.state === 'playing' && !G.params.shot) g.pause(); });

  menu.on('deploy', () => g.deploy());
  menu.on('restart', () => g.deploy({ quiet: true }));
  menu.on('resume', () => g.resume());
  menu.on('retry', () => g.retry());

  // 점검용 손잡이(자동 검증과 디버깅에서 쓴다)
  g.cheat = {
    cutNext() { const j = level.objectives.find((o) => o.active); if (j) cut(j); return g.cut; },
    warp(x, y, z, yaw = 0, pitch = 0) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.yaw = yaw; player.pitch = pitch; player.syncCamera(0); },
    clearEnemies() { for (const e of [...enemies.list]) if (e.alive) e.damage(9999, {}); },
    reinforce(n = 1) { reinforce(REINFORCE[n]); },
  };
  return g;
}

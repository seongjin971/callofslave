import * as THREE from 'three';
import { clamp } from '../core/util.js';

// HUD(상황판 스타일). 캔버스 위에 얹는 DOM이며 매 프레임 필요한 값만 고친다.
// 구성: 방위 띠, 임무 목록, 조준선, 명중·피격 표시, 상호작용 안내, 격파 기록, 체력, 무장, 목표 표식, 무전.

const DEG_PX = 3.2;                                  // 방위 1도의 폭(px). CSS 눈금 간격(15도 = 48px)과 맞춘다.
const POINTS = [['북', 0, 1], ['북동', 45, 0], ['동', 90, 1], ['남동', 135, 0], ['남', 180, 1], ['남서', 225, 0], ['서', 270, 1], ['북서', 315, 0]];
const wrap180 = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

export function createHud(G) {
  const cam = G.camera, bus = G.events;
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
    <div class="hd"><div class="hd-names">${POINTS.map((p) => `<span class="${p[2] ? 'main' : ''}">${p[0]}</span>`).join('')}</div><div class="hd-strip"></div><i class="hd-caret"></i><div class="hd-deg">000°</div><div class="hd-pins"></div></div>
    <div class="ms"><div class="ms-head"><b>임무</b><span class="tagline">작전 〈샛길〉</span></div><div class="ms-title"></div><div class="ms-rows"></div></div>
    <div class="xh"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="hm"></div>
    <div class="dmg"></div><div class="dmg"></div><div class="dmg"></div>
    <div class="act"><div class="act-line"><span class="act-key">E</span><span class="act-text"></span></div><div class="act-bar"><i></i></div></div>
    <div class="feed"></div>
    <div class="note"></div>
    <div class="banner"><i></i><b></b><i></i></div>
    <div class="vit full"><div class="vit-row"><span class="tagline">체력</span><span class="vit-num">100</span></div><div class="vit-bar"><i></i></div></div>
    <div class="wpn"><div class="wpn-state"></div><div class="wpn-mag"><i></i></div><div class="wpn-count"><b>30</b><span>/ 180</span></div><div class="wpn-name">K2C3 · 5.56</div></div>
    <div class="marks"></div>
    <div class="radio" aria-live="polite"><span class="radio-id"></span><span class="radio-text"></span></div>
    <div class="intro" aria-hidden="true"><b></b><span></span></div>`;
  document.getElementById('ui').appendChild(root);
  const q = (s) => root.querySelector(s);

  const hd = q('.hd'), strip = q('.hd-strip'), names = [...root.querySelectorAll('.hd-names span')], deg = q('.hd-deg'), pins = q('.hd-pins');
  const ms = q('.ms'), msTitle = q('.ms-title'), msRows = q('.ms-rows'), marks = q('.marks');
  const xh = q('.xh'), hm = q('.hm'), act = q('.act'), actText = q('.act-text'), actFill = q('.act-bar i');
  const feed = q('.feed'), note = q('.note'), banner = q('.banner'), bannerText = q('.banner b');
  const vit = q('.vit'), vitNum = q('.vit-num'), vitFill = q('.vit-bar i');
  const wpn = q('.wpn'), wpnState = q('.wpn-state'), wpnMag = q('.wpn-mag i'), wpnNow = q('.wpn-count b'), wpnSpare = q('.wpn-count span');
  const radio = q('.radio'), radioId = q('.radio-id'), radioText = q('.radio-text'), intro = q('.intro');
  const dmg = [...root.querySelectorAll('.dmg')].map((el) => ({ el, life: 0, src: new THREE.Vector3() }));

  const targets = new Map();          // id → { row, dist, pin, mark, markDist, pos, done }
  const lines = [];                   // 대기 중인 무전
  const proj = new THREE.Vector3();
  let live = false, speaking = null, shown = 0, typeClock = 0, noteT = 0, introT = 0, actOn = false;
  const last = { hp: -1, ammo: -1, spare: -1, deg: -1, state: null, gap: -1 };

  function addTarget(t) {
    const row = document.createElement('div');
    row.className = 'ms-row' + (t.kind === 'exit' ? ' exit' : '');
    row.innerHTML = `<i>${t.letter}</i><span>${t.name}</span><em></em>`;
    msRows.appendChild(row);
    const pin = document.createElement('div');
    pin.className = 'hd-pin' + (t.kind === 'exit' ? ' exit' : '');
    pin.textContent = t.letter;
    const mark = document.createElement('div');
    mark.className = 'wm' + (t.kind === 'exit' ? ' exit' : '');
    mark.innerHTML = `<b>${t.letter}</b><em></em>`;
    const rec = { ...t, row, pin, mark, dist: row.querySelector('em'), markDist: mark.querySelector('em'), status: row.querySelector('span'), shown: t.kind !== 'exit', done: false };
    if (rec.shown) { pins.appendChild(pin); marks.appendChild(mark); }
    targets.set(t.id, rec);
  }

  const hud = {
    root,
    show(on) { live = on; root.classList.toggle('live', on); },

    // 임무 제목과 목표 목록
    mission(title) { msTitle.textContent = title; ms.classList.add('set'); ms.classList.remove('ping'); void ms.offsetWidth; ms.classList.add('ping'); },
    setTargets(list) {
      msRows.textContent = ''; pins.textContent = ''; marks.textContent = '';
      targets.clear();
      for (const t of list) addTarget(t);
    },
    targetDone(id, word = '차단') {
      const t = targets.get(id);
      if (!t || t.done) return;
      t.done = true; t.row.classList.add('done'); t.status.textContent = `${t.name} ${word}`;
      t.pin.remove(); t.mark.remove();
    },
    openTarget(id) {
      const t = targets.get(id);
      if (!t || t.shown) return;
      t.shown = true; t.row.classList.add('open');
      pins.appendChild(t.pin); marks.appendChild(t.mark);
    },

    note(text, secs = 3) { note.textContent = text; note.classList.add('show'); noteT = secs; },
    banner(text) { bannerText.textContent = text; banner.classList.remove('run'); void banner.offsetWidth; banner.classList.add('run'); },
    hit(kind = '') { hm.className = 'hm'; void hm.offsetWidth; hm.className = 'hm pop ' + kind; },
    log(name, verb) {
      const d = document.createElement('div');
      d.innerHTML = `<b>${name}</b><u>${verb}</u>`;
      feed.appendChild(d);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => d.classList.add('old'), 2600);
      setTimeout(() => d.remove(), 3300);
    },
    hurtFrom(pos) {
      let slot = dmg[0];
      for (const d of dmg) if (d.life < slot.life) slot = d;
      slot.life = 1; slot.src.copy(pos);
    },
    action(text, progress = 0, holding = false) {
      if (!text) { if (actOn) { act.classList.remove('show'); actOn = false; } return; }
      if (!actOn) { act.classList.add('show'); actOn = true; }
      if (actText.textContent !== text) actText.textContent = text;
      act.classList.toggle('hold', holding);
      actFill.style.width = (clamp(progress, 0, 1) * 100).toFixed(1) + '%';
    },
    say(who, text, secs) { lines.push({ who, text, hold: secs ?? Math.max(2.4, text.length * 0.08) }); },
    hush() { lines.length = 0; speaking = null; radio.classList.remove('on'); },
    intro(a, b) { intro.querySelector('b').textContent = a; intro.querySelector('span').textContent = b; intro.classList.add('show'); introT = 6.5; },

    update(dt) {
      if (!live) return;
      const P = G.player, W = G.weapon, sw = G.render.size.w, sh = G.render.size.h;

      // 방위
      let head = ((-P.yaw * 180) / Math.PI) % 360;
      if (head < 0) head += 360;
      const width = hd.clientWidth || 460, half = width / 2;
      const shift = (half - head * DEG_PX).toFixed(1);
      strip.style.backgroundPosition = `${shift}px 100%, ${shift}px 100%`;
      for (let i = 0; i < names.length; i++) {
        const x = wrap180(POINTS[i][1] - head) * DEG_PX;
        names[i].style.transform = `translate3d(${(half + x).toFixed(1)}px,0,0)`;
        names[i].style.opacity = Math.abs(x) > half ? '0' : '1';
      }
      const d0 = Math.round(head) % 360;
      if (d0 !== last.deg) { last.deg = d0; deg.textContent = String(d0).padStart(3, '0') + '°'; }

      // 목표: 목록의 거리, 방위 띠의 핀, 화면 위 표식
      const reach = half * 0.84;
      for (const t of targets.values()) {
        if (t.done || !t.shown) continue;
        const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, dist = Math.hypot(dx, dz);
        const label = Math.round(dist) + 'm';
        if (t.dist.textContent !== label) { t.dist.textContent = label; t.markDist.textContent = label; }
        const off = wrap180((Math.atan2(dx, -dz) * 180) / Math.PI - head) * DEG_PX, px = clamp(off, -reach, reach);
        t.pin.style.transform = `translate3d(${px.toFixed(1)}px,0,0)`;
        t.pin.classList.toggle('far', px !== off);
        proj.copy(t.pos).project(cam);
        const behind = proj.z > 1;
        let x = (proj.x * 0.5 + 0.5) * sw, y = (-proj.y * 0.5 + 0.5) * sh;
        const outside = behind || x < 46 || x > sw - 46 || y < 84 || y > sh - 84;
        if (outside) {
          // 시야 밖이면 화면 가장자리에서 방향만 알려 준다
          let ax = behind ? -proj.x : proj.x, ay = behind ? -proj.y : proj.y;
          const m = Math.max(Math.abs(ax), Math.abs(ay), 1e-3);
          x = clamp(ax / m, -1, 1) * (sw / 2 - 56) + sw / 2; y = clamp(-ay / m, -1, 1) * (sh / 2 - 96) + sh / 2;
        }
        t.mark.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        t.mark.classList.toggle('edge', outside);
        t.mark.classList.toggle('close', dist < 4.5 && !outside);
        t.mark.classList.toggle('faint', P.ads > 0.5);
      }

      // 조준선
      const gap = Math.round(3 + (W.spread * (sh / 2)) / Math.tan((cam.fov * Math.PI) / 360));
      if (gap !== last.gap) { last.gap = gap; xh.style.setProperty('--gap', gap + 'px'); }
      xh.classList.toggle('hide', P.ads > 0.35 || P.sprinting || W.state !== 'idle' || !P.alive);

      // 피격 방향
      for (const d of dmg) {
        if (d.life <= 0) { if (d.el.style.opacity !== '0') d.el.style.opacity = '0'; continue; }
        d.life -= dt * 0.8;
        const a = (Math.atan2(d.src.x - P.pos.x, -(d.src.z - P.pos.z)) * 180) / Math.PI - head;
        d.el.style.transform = `rotate(${a.toFixed(1)}deg)`;
        d.el.style.opacity = clamp(d.life * 1.7, 0, 1).toFixed(2);
      }

      // 체력
      const hp = Math.ceil(P.health);
      if (hp !== last.hp) {
        last.hp = hp;
        vitNum.textContent = hp;
        vitFill.style.width = (hp / P.maxHealth) * 100 + '%';
        vit.classList.toggle('low', hp <= 35);
        vit.classList.toggle('full', hp >= P.maxHealth);
      }

      // 무장
      if (W.ammo !== last.ammo || W.reserve !== last.spare) {
        last.ammo = W.ammo; last.spare = W.reserve;
        wpnNow.textContent = W.ammo; wpnSpare.textContent = '/ ' + W.reserve;
        wpnMag.style.height = (W.ammo / W.magSize) * 100 + '%';
        wpn.classList.toggle('low', W.ammo <= 8);
      }
      const st = W.state === 'reloading' ? '재장전 중' : W.ammo === 0 ? (W.reserve > 0 ? 'R — 재장전' : '탄약 소진') : W.ammo <= 8 && W.reserve > 0 ? '잔탄 적음' : '';
      if (st !== last.state) { last.state = st; wpnState.textContent = st; wpnState.classList.toggle('alarm', W.ammo === 0 && W.state !== 'reloading'); }

      if (noteT > 0 && (noteT -= dt) <= 0) note.classList.remove('show');
      if (introT > 0 && (introT -= dt) <= 0) intro.classList.remove('show');

      // 무전: 한 줄씩 찍어 보여 준다
      if (!speaking && lines.length) {
        speaking = lines.shift(); shown = 0; typeClock = 0;
        radioId.textContent = speaking.who; radioText.textContent = '';
        radio.classList.add('on');
        bus.emit('radio/line', { text: speaking.text });
      }
      if (speaking) {
        if (shown < speaking.text.length) {
          typeClock += dt * 42;
          const n = Math.min(speaking.text.length, Math.floor(typeClock));
          if (n !== shown) { shown = n; radioText.textContent = speaking.text.slice(0, n); }
        } else if ((speaking.hold -= dt) <= 0) {
          speaking = null;
          if (!lines.length) radio.classList.remove('on');
        }
      }
    },
  };
  return hud;
}

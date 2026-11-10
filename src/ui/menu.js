import { QUALITY_NAMES, QUALITY_LABEL, saveSettings, pickQuality } from '../core/config.js';
import { fmtTime } from '../core/util.js';

// 상황판(메뉴). 화면 왼쪽에 서는 한 장의 판이 표지·일시 정지·전사·결과·설정·조작법을 번갈아 보여 준다.
// 오른쪽은 비워 두어 장면이 그대로 보인다.

const row = (dt, dd, cls = '') => `<div><dt>${dt}</dt><dd class="${cls}">${dd}</dd></div>`;
const opt = (n, act, label, cls = '') => `<button class="opt ${cls}" data-n="${n}" data-do="${act}">${label}</button>`;

export function createMenu(G) {
  const bus = G.events, settings = G.settings;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.dataset.view = 'title';
  sheet.setAttribute('role', 'dialog');
  sheet.innerHTML = `
    <section class="sv" data-v="title">
      <div class="sv-top"><span>작전 명령 2030-0309</span><b>대외비</b></div>
      <h1 class="wordmark">회랑</h1>
      <div class="wordmark-en">CORRIDOR 2030</div>
      <dl class="brief">
        ${row('일시', '2030. 3. 9. 04:12', 'num')}
        ${row('지역', '경기도 의정부시 새벽시장 일대')}
        ${row('임무', '적 전파교란기 3기 차단 후 이탈')}
        ${row('적정', '무인 전투체계 다수, 증원 예상')}
      </dl>
      <div class="list">${opt('01', 'deploy', '투입', 'go')}${opt('02', 'options', '설정')}${opt('03', 'keys', '조작법')}</div>
      <p class="sv-foot">v0.1 · 첫 플레이 가능 버전</p>
    </section>

    <section class="sv" data-v="pause">
      <div class="sv-top"><span>작전 〈샛길〉</span></div>
      <h2 class="sv-h">일시 정지</h2>
      <p class="sv-sub" data-t="pause"></p>
      <div class="list">${opt('01', 'resume', '계속', 'go')}${opt('02', 'options', '설정')}${opt('03', 'keys', '조작법')}${opt('04', 'restart', '처음부터 다시')}</div>
    </section>

    <section class="sv" data-v="dead">
      <div class="sv-top"><span>작전 〈샛길〉</span></div>
      <h2 class="sv-h">전사</h2>
      <p class="sv-sub">백호의 교신이 끊겼다.</p>
      <dl class="brief">${row('생존 시간', '00:00', 'num dead-time')}${row('차단', '0 / 3', 'num dead-cut')}</dl>
      <div class="list">${opt('01', 'retry', '재투입', 'go')}${opt('02', 'restart', '처음부터 다시')}</div>
    </section>

    <section class="sv" data-v="done">
      <div class="seal"><b data-t="grade">1급</b><span>평가</span></div>
      <div class="sv-top"><span>작전 〈샛길〉 결과 보고</span></div>
      <h2 class="sv-h">임무 완수</h2>
      <p class="sv-sub">교란기 3기 차단, 이탈 성공. 회랑 상공의 통제권을 되찾았다.</p>
      <dl class="brief">${row('소요 시간', '00:00', 'num done-time')}${row('명중률', '0%', 'num done-acc')}${row('격파', '0', 'num done-kills')}${row('재투입', '0회', 'num done-retry')}</dl>
      <div class="list">${opt('01', 'deploy', '다시 투입', 'go')}</div>
    </section>

    <section class="sv" data-v="options">
      <div class="sv-top"><span>환경 설정</span></div>
      <h2 class="sv-h">설정</h2>
      <div class="field"><span class="lab" id="lab-q">그래픽 품질</span><div class="pick" role="group" aria-labelledby="lab-q">${['auto', ...QUALITY_NAMES].map((k) => `<button data-q="${k}" aria-pressed="false">${QUALITY_LABEL[k]}</button>`).join('')}</div></div>
      <div class="field"><label for="in-sens">마우스 감도</label><div class="range"><input id="in-sens" type="range" min="0.2" max="3" step="0.05"><output></output></div></div>
      <div class="field"><label for="in-vol">음량</label><div class="range"><input id="in-vol" type="range" min="0" max="100" step="1"><output></output></div></div>
      <div class="field"><label for="in-fov">시야각</label><div class="range"><input id="in-fov" type="range" min="60" max="95" step="1"><output></output></div></div>
      <div class="field"><span class="lab" id="lab-inv">상하 반전</span><button class="switch" data-do="invert" aria-labelledby="lab-inv" aria-pressed="false"><i></i><span>끔</span></button></div>
      <div class="field"><span class="lab">화면</span><button class="plain" data-do="fullscreen">전체 화면으로</button></div>
      <p class="hint" data-t="quality"></p>
      <div class="list">${opt('←', 'back', '돌아가기', 'back')}</div>
    </section>

    <section class="sv" data-v="keys">
      <div class="sv-top"><span>키보드 · 마우스</span></div>
      <h2 class="sv-h">조작법</h2>
      <dl class="keymap">
        ${row('이동', '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>')}
        ${row('시점 · 사격 · 조준', '마우스 · 왼쪽 · 오른쪽')}
        ${row('재장전', '<kbd>R</kbd>')}
        ${row('교란기 차단', '<kbd>E</kbd> 누르고 있기')}
        ${row('질주 · 앉기 · 점프', '<kbd>Shift</kbd><kbd>C</kbd><kbd>Space</kbd>')}
        ${row('근접 타격', '<kbd>F</kbd>')}
        ${row('일시 정지', '<kbd>Esc</kbd><kbd>P</kbd>')}
      </dl>
      <p class="hint">마우스가 화면에 고정되지 않는 환경에서는 버튼을 누른 채 끌면 시점이 움직입니다. 방향키로도 시점을 돌릴 수 있습니다.</p>
      <div class="list">${opt('←', 'back', '돌아가기', 'back')}</div>
    </section>`;
  document.getElementById('ui').appendChild(sheet);

  const q = (s) => sheet.querySelector(s), all = (s) => [...sheet.querySelectorAll(s)];
  const actions = {};
  let view = 'none', parentView = 'title', hovered = null;

  function setView(v) {
    view = v;
    sheet.dataset.view = v;
    sheet.classList.toggle('open', v !== 'none');
    sheet.scrollTop = 0;
    if (v !== 'none' && !G.params.shot) {
      const first = q(`.sv[data-v="${v}"] .opt`);
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 40);
    }
  }

  function refresh() {
    all('.pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === settings.quality)));
    const set = (id, value, text) => { const el = q('#' + id); el.value = value; el.parentElement.querySelector('output').textContent = text; };
    set('in-sens', settings.sens, settings.sens.toFixed(2));
    set('in-vol', Math.round(settings.volume * 100), Math.round(settings.volume * 100) + '%');
    set('in-fov', settings.fov, settings.fov + '°');
    const inv = q('[data-do="invert"]');
    inv.setAttribute('aria-pressed', String(settings.invertY));
    inv.querySelector('span').textContent = settings.invertY ? '켬' : '끔';
    q('[data-do="fullscreen"]').textContent = document.fullscreenElement ? '창 화면으로' : '전체 화면으로';
    q('[data-t="quality"]').textContent = `적용 중: ${QUALITY_LABEL[G.quality.name] || G.quality.name} · 내부 해상도 ${G.render.size.bw}×${G.render.size.bh}. 텍스처 선명도는 새로 불러올 때 반영됩니다.`;
  }
  function apply() {
    G.input.sensitivity = settings.sens;
    G.input.invertY = settings.invertY;
    G.player.baseFov = settings.fov;
    if (G.audio.setVolume) G.audio.setVolume(settings.volume);
    saveSettings(settings);
  }

  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    bus.emit('ui/click', {});
    if (b.dataset.q) {
      settings.quality = b.dataset.q;
      G.render.applyQuality(pickQuality(settings.quality));
      apply(); refresh();
      return;
    }
    const act = b.dataset.do;
    if (act === 'options' || act === 'keys') { parentView = view; setView(act); refresh(); return; }
    if (act === 'back') return setView(parentView);
    if (act === 'invert') { settings.invertY = !settings.invertY; apply(); refresh(); return; }
    if (act === 'fullscreen') {
      const app = document.getElementById('app');
      const p = document.fullscreenElement ? document.exitFullscreen() : app.requestFullscreen ? app.requestFullscreen() : Promise.reject();
      Promise.resolve(p).catch(() => { b.textContent = '전체 화면을 쓸 수 없는 환경'; });
      return;
    }
    if (actions[act]) actions[act]();
  });
  sheet.addEventListener('pointerover', (e) => { const b = e.target.closest('button'); if (b && b !== hovered) { hovered = b; bus.emit('ui/hover', {}); } });
  sheet.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'in-sens') settings.sens = +el.value;
    else if (el.id === 'in-vol') settings.volume = +el.value / 100;
    else if (el.id === 'in-fov') settings.fov = +el.value;
    else return;
    apply(); refresh();
  });
  document.addEventListener('fullscreenchange', () => { if (view === 'options') refresh(); });
  window.addEventListener('keydown', (e) => {
    if (view === 'none') return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (view === 'options' || view === 'keys') setView(parentView);
      else if (view === 'pause' && actions.resume && !e.repeat) actions.resume();
    }
  });

  apply();

  return {
    sheet,
    get view() { return view; },
    on(act, fn) { actions[act] = fn; },
    open(v, data = {}) {
      if (v === 'pause') q('[data-t="pause"]').textContent = G.input.lockFailed ? '계속한 뒤 마우스 버튼을 누른 채 끌어 둘러봅니다.' : '계속하면 화면이 마우스를 다시 잡습니다.';
      if (v === 'dead') { q('.dead-time').textContent = fmtTime(data.time || 0); q('.dead-cut').textContent = `${data.cut || 0} / 3`; }
      if (v === 'done') {
        q('[data-t="grade"]').textContent = data.grade || '2급';
        q('.done-time').textContent = fmtTime(data.time || 0);
        q('.done-acc').textContent = Math.round((data.accuracy || 0) * 100) + '%';
        q('.done-kills').textContent = String(data.kills || 0);
        q('.done-retry').textContent = (data.retries || 0) + '회';
      }
      setView(v);
    },
    close() { setView('none'); },
  };
}

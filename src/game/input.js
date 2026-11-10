// 입력: 키보드와 마우스.
// 마우스는 화면에 고정(pointer lock)해서 쓰고, 고정이 안 되는 환경에서는 버튼을 누른 채 끄는 방식으로 바꾼다.
// update()가 한 프레임치 상태를 정리하고 endFrame()이 '방금 눌림' 표시를 지운다.

const RAD_PER_PX = 0.0021;
const ARROW_TURN = 1.9;          // 방향키 시점 회전(rad/s)

export function createInput(G) {
  const canvas = document.getElementById('view');
  const held = new Set(), tapped = new Set();
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftTap: false };
  let locked = false, everLocked = false, selfExit = false;

  const api = {
    move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 },
    fire: false, firePressed: false, ads: false, sprint: false, crouch: false,
    jumpPressed: false, reloadPressed: false, interact: false, meleePressed: false, pausePressed: false,
    locked: false,
    lockFailed: false,           // 한 번도 고정하지 못한 환경 → 끌어서 보기로 전환
    enabled: false,
    sensitivity: 1, invertY: false,
    script: null,                // 점검용: 입력을 코드로 덮어쓴다 { move, turn, fire, ads, ... }

    requestLock() {
      if (locked || api.lockFailed) return;
      const fail = () => { if (!everLocked) { api.lockFailed = true; G.events.emit('input/lock', { locked: false, failed: true }); } };
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(fail); } catch { fail(); }
    },
    exitLock() {
      if (document.pointerLockElement !== canvas) return;
      selfExit = true;
      try { document.exitPointerLock(); } catch { /* 무시 */ }
    },

    update(dt) {
      const on = (code) => held.has(code);
      let x = (on('KeyD') ? 1 : 0) - (on('KeyA') ? 1 : 0), y = (on('KeyW') ? 1 : 0) - (on('KeyS') ? 1 : 0);
      const n = Math.hypot(x, y);
      if (n > 1) { x /= n; y /= n; }
      api.move.x = x; api.move.y = y;

      const ax = (on('ArrowRight') ? 1 : 0) - (on('ArrowLeft') ? 1 : 0), ay = (on('ArrowDown') ? 1 : 0) - (on('ArrowUp') ? 1 : 0);
      let dx = mouse.dx * RAD_PER_PX * api.sensitivity + ax * ARROW_TURN * dt;
      let dy = mouse.dy * RAD_PER_PX * api.sensitivity + ay * ARROW_TURN * 0.7 * dt;

      api.fire = mouse.left;
      api.firePressed = mouse.leftTap;
      api.ads = mouse.right;
      api.sprint = on('ShiftLeft') || on('ShiftRight');
      api.crouch = on('KeyC') || on('ControlLeft');
      api.jumpPressed = tapped.has('Space');
      api.reloadPressed = tapped.has('KeyR');
      api.interact = on('KeyE');
      api.meleePressed = tapped.has('KeyF');
      api.pausePressed = tapped.has('KeyP') || tapped.has('Escape');
      api.locked = locked;

      const s = api.script;
      if (s) {
        if (s.move) { api.move.x = s.move[0]; api.move.y = s.move[1]; }
        if (s.turn) { dx += s.turn[0] * dt; dy += s.turn[1] * dt; }
        for (const k of ['fire', 'firePressed', 'ads', 'sprint', 'crouch', 'jumpPressed', 'reloadPressed', 'interact', 'meleePressed']) if (k in s) api[k] = s[k];
      }
      api.look.dx = dx; api.look.dy = api.invertY ? -dy : dy;
    },
    endFrame() { tapped.clear(); mouse.dx = 0; mouse.dy = 0; mouse.leftTap = false; },
  };

  const inField = (e) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (inField(e)) return;
    if (!e.repeat) tapped.add(e.code);
    held.add(e.code);
    if (api.enabled && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow'))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); mouse.left = false; mouse.right = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (!api.enabled) return;
    e.preventDefault();
    // 고정이 풀려 있으면 첫 클릭은 화면을 다시 잡는 데만 쓴다
    if (!locked && !api.lockFailed) { api.requestLock(); return; }
    if (e.button === 0) { mouse.left = true; mouse.leftTap = true; }
    else if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    else if (e.button === 2) mouse.right = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!api.enabled) return;
    if (locked || (api.lockFailed && (mouse.left || mouse.right))) { mouse.dx += e.movementX || 0; mouse.dy += e.movementY || 0; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    const now = document.pointerLockElement === canvas;
    const lost = locked && !now && !selfExit;       // 게임이 푼 것이 아니라 사용자가(Esc 등) 푼 경우
    locked = now; api.locked = now;
    if (now) everLocked = true;
    else { mouse.left = false; mouse.right = false; selfExit = false; }
    G.events.emit('input/lock', { locked: now, lost });
  });
  document.addEventListener('pointerlockerror', () => {
    if (!everLocked) { api.lockFailed = true; G.events.emit('input/lock', { locked: false, failed: true }); }
  });

  return api;
}

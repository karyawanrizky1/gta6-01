// Keyboard + mouse-drag input. Keys are edge-triggered through `pressed()`; held state via `down()`.
export const ACTION = {
  PAUSE: 'pause', MISSIONS: 'missions', ENTER: 'enter', PUNCH: 'punch',
  JUMP: 'jump', RELOAD: 'reload', MUTE: 'mute', CONFIRM: 'confirm',
};

const KEYMAP = {
  KeyP: 'pause', Escape: 'pause', KeyM: 'missions', KeyE: 'enter',
  KeyF: 'punch', Space: 'jump', KeyR: 'reload', KeyU: 'mute', Enter: 'confirm',
};

export function createInput(canvas) {
  const held = new Set();
  const tapped = new Set();
  let dragDX = 0; let dragDY = 0; let dragging = false; let lastX = 0; let lastY = 0;
  let mouseDown = false; let mouseTapped = false;

  function onKey(e, isDown) {
    const action = KEYMAP[e.code];
    if (action) {
      if (isDown && !e.repeat && !held.has(action)) tapped.add(action);
      if (isDown) held.add(action); else held.delete(action);
      e.preventDefault();
    } else if (isDown) {
      held.add(e.code);
    } else {
      held.delete(e.code);
    }
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { held.clear(); dragging = false; });
  canvas.addEventListener('mousedown', (e) => {
    mouseDown = true; dragging = true; lastX = e.clientX; lastY = e.clientY;
    mouseTapped = true;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    dragDX += e.clientX - lastX; dragDY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; dragging = false; });

  return {
    down(code) { return held.has(code); },
    axis() {
      let x = 0; let y = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) y += 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y -= 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      return { x, y };
    },
    run() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    pressed(action) { return tapped.has(action); },
    shoot() { const v = mouseTapped; mouseTapped = false; return v; },
    mouseDown() { return mouseDown; },
    drag() { const d = { dx: dragDX, dy: dragDY }; dragDX = 0; dragDY = 0; return d; },
    endFrame() { tapped.clear(); },
  };
}

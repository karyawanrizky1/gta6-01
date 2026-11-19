// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, the renderer paints what is there, and the DOM carries the HUD and the menus.
// Screens: title, how-to, missions, pause, game-over, mission-complete, play.
// ?seed=N fixes the city's luck. ?shot=chase|title|mission|dusk stages that scene instead
// of running the loop, paints it a few times and sets window.__shotReady for a screenshot.
import { STEP, SAVE_KEY, BEST_KEY, MISSIONS, PLACES } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_SHOT, EVENT_PUNCH, EVENT_CRIME, EVENT_MISSION, EVENT_BUSTED, EVENT_DEAD, EVENT_CRASH, EVENT_FAIL, EVENT_PICKUP } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const world = createWorld(createRandom(seed));
const minimapCanvas = document.getElementById('minimap');
const renderer = createRenderer(canvas, minimapCanvas);
const audio = createAudio();

const $ = (id) => document.getElementById(id);
const menus = ['menu-title', 'menu-how', 'menu-missions', 'menu-pause', 'menu-over', 'menu-done'];
function showMenu(id) {
  for (const m of menus) $(m).classList.toggle('hidden', m !== id);
  const hud = document.querySelectorAll('.hud');
  const hideHud = id === 'menu-title' || id === 'menu-how';
  hud.forEach((el) => el.classList.toggle('hidden', hideHud && el.id !== 'toast'));
}
function hideMenus() { for (const m of menus) $(m).classList.add('hidden'); }
function announce(msg) { statusEl.textContent = msg; }

let toastTimer = null;
function toast(msg, ms = 4200) {
  const t = $('toast');
  t.textContent = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.textContent = ''; }, ms);
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.save()));
    const best = Math.max(world.state.player.cash, readBest());
    window.localStorage.setItem(BEST_KEY, String(best));
    return true;
  } catch { return false; }
}
function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

function updateHud() {
  const s = world.state; const p = s.player;
  $('cash').textContent = `$${p.cash}`;
  $('mission-label').textContent = world.currentMission() ? `MISSION ${world.currentMission().id}/3` : 'ALL MISSIONS DONE';
  $('hpfill').style.width = `${Math.max(0, p.health)}%`;
  const stars = $('stars').children;
  for (let i = 0; i < 3; i += 1) stars[i].className = i < s.wanted ? '' : 'off';
  const obj = world.objectiveText();
  $('obj-title').textContent = obj.title;
  $('obj-text').textContent = obj.text;
  const car = p.inCar ? s.cars.find((c) => c.id === p.inCar) : null;
  $('speed').textContent = car ? Math.round(Math.abs(car.speed) * 3.6) : Math.round(p.speed * 3.6);
  $('carname').textContent = car ? car.name : (p.inCar ? '' : 'ON FOOT');
  $('ammo-n').textContent = `${p.ammo} / ${p.reserve}`;
  $('wanted-note').textContent = s.wanted > 0 ? `WANTED ${'★'.repeat(s.wanted)} — hide!` : '';
  const hh = Math.floor(s.clock) % 24; const mm = Math.floor((s.clock % 1) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · SOLMARA BAY${s.dusk ? ' · DUSK' : ''}`;
  $('cross').style.display = (!p.inCar && p.ammo > 0) ? 'block' : 'none';
  renderer.drawMinimap(s, world.waypoint());
}

function missionListHtml() {
  return MISSIONS.map((m) => {
    const done = world.state.missionIdx > m.id - 1;
    const active = world.state.missionIdx === m.id - 1;
    const mark = done ? '✓ DONE' : active ? '▶ ACTIVE' : '· LOCKED';
    return `<b>${m.id}. ${m.name}</b> — $${m.pay} — ${mark}<br><span style="font-weight:400">${m.brief}</span><br><br>`;
  }).join('') + `<span style="color:#9fd8ff">Cash so far: $${world.state.player.cash} · Best: $${readBest()}</span>`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.state._waypoint = world.waypoint();
  if (scene.screen === 'title') {
    showMenu('menu-title');
    $('btn-continue').classList.add('hidden');
  } else {
    hideMenus();
  }
  updateHud();
  let painted = 0;
  function paint() {
    world.state._waypoint = world.waypoint();
    renderer.draw(world.state, world.state.time);
    updateHud();
    painted += 1;
    // Paint ~12 frames so the chase camera fully settles behind the car.
    if (painted < 12) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let muted = false;

  const save = readSave();
  if (save) $('btn-continue').classList.remove('hidden');
  showMenu('menu-title');
  announce('Solmara Bay. New game, continue, or how to play.');

  function startNew() {
    world.reset();
    screen = 'play';
    hideMenus();
    announce('Playing. Explore Solmara Bay — press M for missions.');
    toast('Welcome to Solmara Bay. Press M to see your first mission.');
  }
  function startContinue() {
    const sv = readSave();
    if (sv) world.load(sv);
    screen = 'play';
    hideMenus();
    announce('Continuing your game.');
    toast('Welcome back, Jay. The city missed you.');
  }
  function pauseGame() {
    if (screen !== 'play') return;
    screen = 'pause';
    $('pause-stats').textContent = `Cash $${world.state.player.cash} · Health ${Math.round(world.state.player.health)} · ` +
      `${world.currentMission() ? `Mission ${world.currentMission().id}: ${world.currentMission().name}` : 'All missions complete'}`;
    showMenu('menu-pause');
    announce('Paused.');
  }
  function resumeGame() {
    screen = 'play';
    hideMenus();
    announce('Playing.');
  }
  function gameOver(title, text) {
    screen = 'over';
    $('over-title').textContent = title;
    $('over-text').textContent = text;
    showMenu('menu-over');
    audio.busted();
    announce(`${title}. ${text}`);
  }
  function missionDone(pay) {
    screen = 'done';
    $('done-text').textContent = `Jay pockets $${pay}. Progress saved — the next job is waiting on the mission list (M).`;
    showMenu('menu-done');
    audio.chime();
    writeSave();
  }

  $('btn-new').addEventListener('click', () => { audio.unlock(); startNew(); });
  $('btn-continue').addEventListener('click', () => { audio.unlock(); startContinue(); });
  $('btn-how').addEventListener('click', () => showMenu('menu-how'));
  $('btn-how-back').addEventListener('click', () => showMenu('menu-title'));
  $('btn-missions-back').addEventListener('click', () => resumeGame());
  $('btn-resume').addEventListener('click', () => resumeGame());
  $('btn-save').addEventListener('click', () => { writeSave(); toast('Game saved.'); });
  $('btn-quit').addEventListener('click', () => { writeSave(); screen = 'title'; showMenu('menu-title'); if (readSave()) $('btn-continue').classList.remove('hidden'); });
  $('btn-retry').addEventListener('click', () => {
    const sv = readSave();
    if (sv) world.load(sv); else world.reset();
    screen = 'play'; hideMenus();
  });
  $('btn-over-title').addEventListener('click', () => { screen = 'title'; showMenu('menu-title'); });
  $('btn-done').addEventListener('click', () => resumeGame());

  function handleEvents(events) {
    if (events & EVENT_SHOT) {
      audio.gunshot();
      const p = world.state.player;
      const yaw = world.state.cam.yaw;
      renderer.shootTracer(
        { x: p.x, y: 1.5, z: p.z },
        { x: p.x + Math.sin(yaw) * 40, y: 1.5, z: p.z + Math.cos(yaw) * 40 },
      );
    }
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRIME) toast(world.state.message || 'The police saw that!');
    if (events & EVENT_FAIL) { toast(world.state.message); audio.busted(); }
    if (events & EVENT_MISSION) {
      const m = MISSIONS[world.state.missionIdx - 1];
      if (m) missionDone(m.pay);
    }
    if (events & EVENT_BUSTED) gameOver('BUSTED', 'The Solmara Bay Police caught Jay. He pays a $100 fine and walks out — the city is still his to take.');
    if (events & EVENT_DEAD) gameOver('WASTED', 'Jay is down. Solmara Bay keeps moving without him — until the next try.');
  }

  function step() {
    const axis = input.axis();
    const ctl = {
      ax: axis.x, ay: axis.y, run: input.run(),
      jump: input.down('jump'), enter: input.pressed('enter'),
      punch: input.pressed('punch'), shoot: input.shoot(),
      reload: input.pressed('reload'), drag: input.drag(),
    };
    if (input.pressed('mute')) { muted = audio.toggleMute(); toast(muted ? 'Sound muted (U to unmute)' : 'Sound on'); }
    if (input.pressed('pause')) {
      if (screen === 'play') pauseGame();
      else if (screen === 'pause') resumeGame();
      return;
    }
    if (input.pressed('missions') && screen === 'play') {
      screen = 'missions';
      $('mission-list').innerHTML = missionListHtml();
      showMenu('menu-missions');
      return;
    }
    if (screen !== 'play') return;
    const events = world.step(STEP, ctl);
    handleEvents(events);
    audio.engine(world.state.player.inCar ? Math.abs((world.state.cars.find((c) => c.id === world.state.player.inCar) || { speed: 0 }).speed) / 50 : 0, !!world.state.player.inCar);
    audio.siren(world.state.wanted > 0, world.state.time);
    input.endFrame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === 'play' || screen === 'title') {
      while (accumulator >= STEP && (screen === 'play' || screen === 'title')) {
        if (screen === 'title') {
          // Living city behind the title: traffic and peds move, nobody plays.
          world.step(STEP, { ax: 0, ay: 0, run: false, jump: false, enter: false, punch: false, shoot: false, reload: false, drag: { dx: 0, dy: 0 } });
        } else {
          step();
        }
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    world.state._waypoint = world.waypoint();
    renderer.draw(world.state, world.state.time);
    if (screen === 'play') updateHud();
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// Small debug hook for play-testing (read-only state inspection).
window.__world = world;

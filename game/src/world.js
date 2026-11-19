// Solmara Bay — the simulation. No drawing, no browser here: player on foot and in cars,
// traffic, pedestrians, police, wanted level, missions, combat, collisions and saving.
// step(dt, ctl) advances one fixed step and returns event bit flags for the caller.
import {
  BLOCK, PITCH, COLS, ROWS, X0, Z0, BEACH_Z, SEA_Z, PLACES, MISSIONS,
  CAR_TYPES, PLAYER, WANTED, blockCentre, roadX, roadZ,
} from './config.js';

export const EVENT_SHOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_CRIME = 4;
export const EVENT_MISSION = 8;
export const EVENT_BUSTED = 16;
export const EVENT_DEAD = 32;
export const EVENT_PICKUP = 64;
export const EVENT_CRASH = 128;
export const EVENT_FAIL = 256;

const SPECIAL_BLOCKS = new Set(['5,4', '4,3', '9,0', '8,0', '9,1', '0,0', '9,3', '9,6', '8,6', '1,1']);
// 5,4 park · 4,3 plaza · 9,0/8,0/9,1 airstrip · 0,0 spawn corner · 9,3 docks · 9,6 marina lot · 8,6 hotel · 1,1 police HQ
const BUILD_COLORS = [0xc98a6b, 0x8fa3b8, 0xd9b48f, 0x9db08a, 0xb87f7f, 0x7f9fb5, 0xe0cfa8, 0xa88fc0];

function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function createWorld(random) {
  const state = {
    time: 0, clock: 8.0, // hours; golden morning, drifts to dusk
    player: null, cars: [], peds: [], buildings: [], trees: [],
    wanted: 0, heatTimer: 0, lastCrime: -99,
    missionIdx: 0, stageIdx: 0, stageTimer: 0, passenger: false, hasPackage: false,
    bustedTimer: 0, message: '', roadblockDone: false,
    cam: { yaw: Math.PI * 0.75, pitch: 0.32, dist: 10 },
    dusk: false,
  };
  let nextCarId = 1;

  function makeCar(type, x, z, heading, driver) {
    const t = CAR_TYPES[type];
    const car = {
      id: nextCarId++, type, name: t.name, x, z, heading, speed: 0,
      top: t.top, accel: t.accel, color: t.color, driver,
      parked: driver === 'none', cruise: 9 + random.range(0, 5),
      axis: random.next() < 0.5 ? 'x' : 'z', dir: random.next() < 0.5 ? 1 : -1,
      lane: random.range(-2.2, 2.2), hitCooldown: 0, siren: driver === 'police',
    };
    state.cars.push(car);
    return car;
  }

  function makePed(x, z) {
    return {
      x, z, heading: random.range(0, Math.PI * 2), speed: random.range(0.8, 1.6),
      state: 'walk', health: 100, down: false, fleeT: 0,
      shirt: [0xd95f4b, 0x4b8fd9, 0x6fbf5a, 0xe0a83c, 0x9a6fd0, 0xdddddd][random.int(0, 5)],
      road: random.int(0, COLS), axis: random.next() < 0.5 ? 'x' : 'z',
      dir: random.next() < 0.5 ? 1 : -1,
    };
  }

  function buildCity() {
    state.buildings = []; state.trees = [];
    for (let i = 0; i < COLS; i += 1) {
      for (let j = 0; j < ROWS; j += 1) {
        if (SPECIAL_BLOCKS.has(`${i},${j}`)) continue;
        const c = blockCentre(i, j);
        const n = random.next() < 0.35 ? 2 : 1;
        for (let k = 0; k < n; k += 1) {
          const w = n === 1 ? 18 : 8.5;
          const d = n === 1 ? 18 : 8.5;
          const ox = n === 1 ? 0 : (k === 0 ? -5.5 : 5.5);
          const oz = n === 1 ? 0 : (k === 0 ? -5.5 : 5.5);
          state.buildings.push({
            x: c.x + ox, z: c.z + oz, w, d,
            h: 6 + random.range(0, 26) * (random.next() < 0.12 ? 2.2 : 1),
            color: random.pick(BUILD_COLORS),
          });
        }
      }
    }
    // Hotel Miramar tower + police HQ + docks warehouses (landmarks, fixed).
    state.buildings.push({ x: 119, z: 85, w: 16, d: 16, h: 52, color: 0xe8d9a0 });
    state.buildings.push({ x: -119, z: -85, w: 18, d: 14, h: 14, color: 0x2f4d7a });
    state.buildings.push({ x: 153, z: -34, w: 14, d: 20, h: 9, color: 0x8a6f4d });
    state.buildings.push({ x: 153, z: 0, w: 14, d: 20, h: 9, color: 0x6f7a5a });
    // Palm trees: beach row, park, plaza.
    for (let x = -160; x <= 160; x += 14) state.trees.push({ x: x + random.range(-3, 3), z: BEACH_Z + 8 + random.range(-2, 2), s: random.range(0.9, 1.3) });
    for (let k = 0; k < 14; k += 1) state.trees.push({ x: random.range(-8, 42), z: random.range(-8, 42), s: random.range(0.9, 1.4) });
    for (let k = 0; k < 6; k += 1) state.trees.push({ x: random.range(-34, 0), z: random.range(-34, 0), s: random.range(0.9, 1.3) });
  }

  function reset() {
    nextCarId = 1;
    state.time = 0; state.clock = 8.0;
    state.wanted = 0; state.heatTimer = 0; state.lastCrime = -99;
    state.missionIdx = 0; state.stageIdx = 0; state.stageTimer = 0;
    state.passenger = false; state.hasPackage = false;
    state.bustedTimer = 0; state.message = ''; state.roadblockDone = false;
    state.cam = { yaw: Math.PI * 0.75, pitch: 0.32, dist: 10 };
    state.dusk = false;
    state.player = {
      x: 0, z: 60, y: 0, vy: 0, heading: 0, health: PLAYER.maxHealth,
      cash: 0, ammo: PLAYER.pistolAmmo, reserve: 48, inCar: null, punchT: 0,
      shootT: 0, speed: 0,
    };
    state.cars = []; state.peds = [];
    buildCity();
    // Parked cars around the city (stealable), plus the mission Comet GT at the marina.
    const parkedSpots = [
      ['sedan', -68, 17], ['taxi', 34, -51], ['van', -102, 51], ['sedan', 68, -17],
      ['truck', -136, -17], ['sedan', 102, 51], ['taxi', 0, -85], ['van', -34, 119],
      ['sedan', 136, 17], ['sports', -68, -85],
    ];
    for (const [type, x, z] of parkedSpots) makeCar(type, x, z, random.range(0, Math.PI * 2), 'none');
    makeCar('sports', PLACES.marina.x, PLACES.marina.z - 6, Math.PI / 2, 'none');
    // Traffic.
    const types = ['sedan', 'taxi', 'van', 'sedan', 'taxi', 'truck', 'sedan', 'sports', 'van', 'sedan', 'taxi', 'sedan'];
    for (let k = 0; k < 12; k += 1) {
      const axis = random.next() < 0.5 ? 'x' : 'z';
      const line = axis === 'x' ? roadZ(random.int(1, ROWS - 1)) : roadX(random.int(1, COLS - 1));
      const along = random.range(-150, 150);
      const car = makeCar(types[k], axis === 'x' ? along : line, axis === 'x' ? line : along, 0, 'traffic');
      car.axis = axis; car.dir = random.next() < 0.5 ? 1 : -1;
      car.heading = axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.speed = car.cruise; car.parked = false;
    }
    // Pedestrians on sidewalks.
    for (let k = 0; k < 22; k += 1) {
      const axis = random.next() < 0.5 ? 'x' : 'z';
      const line = axis === 'x' ? roadZ(random.int(0, ROWS)) : roadX(random.int(0, COLS));
      state.peds.push(makePed(axis === 'x' ? random.range(-160, 160) : line + random.range(-6, 6),
        axis === 'x' ? line + random.range(-6, 6) : random.range(-130, 160)));
    }
  }

  function collideCircle(x, z, r) {
    // Push a circle out of building AABBs; returns corrected position.
    let nx = x; let nz = z;
    for (const b of state.buildings) {
      const cx = clamp(nx, b.x - b.w / 2, b.x + b.w / 2);
      const cz = clamp(nz, b.z - b.d / 2, b.z + b.d / 2);
      const dx = nx - cx; const dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * r; nz = cz + (dz / d) * r;
        } else {
          nx += r; // centre inside: push east
        }
      }
    }
    return { x: nx, z: nz };
  }

  function addWanted(n) {
    state.wanted = clamp(state.wanted + n, 0, 3);
    state.lastCrime = state.time;
    state.heatTimer = 0;
    if (state.wanted === 3 && !state.roadblockDone) {
      state.roadblockDone = true;
      spawnPolice(2);
    }
  }

  function spawnPolice(n) {
    const p = state.player;
    for (let k = 0; k < n; k += 1) {
      const a = random.range(0, Math.PI * 2);
      const car = makeCar('police', p.x + Math.cos(a) * 45, p.z + Math.sin(a) * 45, a, 'police');
      car.parked = false; car.speed = 10;
    }
  }

  function policeCount() {
    let n = 0;
    for (const c of state.cars) if (c.driver === 'police') n += 1;
    return n;
  }

  function nearestCar(x, z, maxD) {
    let best = null; let bestD = maxD * maxD;
    for (const c of state.cars) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function currentMission() { return MISSIONS[state.missionIdx] || null; }
  function currentStage() {
    const m = currentMission();
    return m ? m.stages[state.stageIdx] : null;
  }
  function waypoint() {
    const s = currentStage();
    if (!s) return null;
    const p = PLACES[s.target];
    return p ? { x: p.x, z: p.z, label: p.label } : null;
  }
  function objectiveText() {
    const m = currentMission();
    const s = currentStage();
    if (!m) return { title: 'Solmara Bay — free roam', text: 'All missions complete. The city is yours.' };
    let text = s.text;
    if (s.timer) text += ` — ${Math.max(0, Math.ceil(state.stageTimer))}s left`;
    return { title: `Mission ${m.id}: ${m.name}`, text };
  }

  function completeStage() {
    const m = currentMission();
    state.stageIdx += 1;
    if (state.stageIdx >= m.stages.length) {
      state.player.cash += m.pay;
      state.missionIdx += 1; state.stageIdx = 0;
      state.passenger = false; state.hasPackage = false;
      state.message = `Mission complete — $${m.pay} earned`;
      return EVENT_MISSION;
    }
    const next = currentStage();
    if (next && next.timer) state.stageTimer = next.timer;
    if (next && next.wanted) addWanted(next.wanted - state.wanted);
    return EVENT_PICKUP;
  }

  function failStage(reason) {
    state.stageIdx = 0; state.passenger = false; state.hasPackage = false;
    const m = currentMission();
    if (m) {
      const s = m.stages[0];
      if (s.timer) state.stageTimer = 0;
    }
    state.message = reason;
    return EVENT_FAIL;
  }

  function stepPlayer(dt, ctl) {
    const p = state.player;
    const d = ctl.drag || { dx: 0, dy: 0 };
    state.cam.yaw -= d.dx * 0.005;
    state.cam.pitch = clamp(state.cam.pitch + d.dy * 0.003, 0.08, 1.1);
    if (p.punchT > 0) p.punchT -= dt;
    if (p.shootT > 0) p.shootT -= dt;

    if (p.inCar) { stepDriving(dt, ctl); return; }

    // On foot.
    const speed = ctl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const ax = ctl.ax || 0; const ay = ctl.ay || 0;
    if (ax !== 0 || ay !== 0) {
      const yaw = state.cam.yaw;
      // Forward is camera yaw direction; W moves away from camera.
      const fx = Math.sin(yaw); const fz = Math.cos(yaw);
      const rx = Math.cos(yaw); const rz = -Math.sin(yaw);
      const mx = fx * ay + rx * ax; const mz = fz * ay + rz * ax;
      const len = Math.hypot(mx, mz) || 1;
      const nx = p.x + (mx / len) * speed * dt;
      const nz = p.z + (mz / len) * speed * dt;
      const fixed = collideCircle(nx, nz, 0.6);
      p.x = clamp(fixed.x, -178, 178); p.z = clamp(fixed.z, -142, BEACH_Z + 30);
      p.heading = Math.atan2(mx, mz);
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    // Jump / gravity.
    if (ctl.jump && p.y === 0) p.vy = PLAYER.jumpSpeed;
    if (p.y > 0 || p.vy !== 0) {
      p.vy -= 22 * dt; p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    // Enter a car.
    if (ctl.enter) {
      const car = nearestCar(p.x, p.z, 4.5);
      if (car) {
        const wasParked = car.parked;
        const wasDriven = car.driver === 'traffic';
        p.inCar = car.id; car.driver = 'player'; car.parked = false;
        if (wasParked || wasDriven) {
          // Stealing in sight of a ped or a police car is a crime.
          let seen = false;
          for (const ped of state.peds) if (!ped.down && dist2(p.x, p.z, ped.x, ped.z) < 500) { seen = true; break; }
          if (!seen) for (const c of state.cars) if (c.driver === 'police' && dist2(p.x, p.z, c.x, c.z) < 900) { seen = true; break; }
          if (seen) { addWanted(WANTED.steal); state.message = 'Car stolen — the cops are coming'; return EVENT_CRIME; }
        }
      }
    }
    // Punch.
    if (ctl.punch && p.punchT <= 0) {
      p.punchT = 0.45;
      let hit = false;
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (dist2(p.x, p.z, ped.x, ped.z) < PLAYER.punchRange * PLAYER.punchRange) {
          ped.health -= PLAYER.punchDamage; ped.state = 'flee'; ped.fleeT = 4;
          if (ped.health <= 0) { ped.down = true; addWanted(WANTED.hitPed); }
          hit = true;
        }
      }
      if (hit) return EVENT_PUNCH;
      return EVENT_PUNCH;
    }
    // Shoot (hitscan toward camera forward, from the player).
    if (ctl.shoot && p.shootT <= 0 && p.ammo > 0) {
      p.shootT = 0.28; p.ammo -= 1;
      const yaw = state.cam.yaw;
      const dx = Math.sin(yaw); const dz = Math.cos(yaw);
      let bestD = 60; let bestPed = null; let bestCar = null;
      for (const ped of state.peds) {
        if (ped.down) continue;
        const px = ped.x - p.x; const pz = ped.z - p.z;
        const along = px * dx + pz * dz;
        if (along < 0 || along > bestD) continue;
        const perp = Math.abs(px * dz - pz * dx);
        if (perp < 1.2) { bestD = along; bestPed = ped; bestCar = null; }
      }
      for (const c of state.cars) {
        if (c.driver === 'player') continue;
        const px = c.x - p.x; const pz = c.z - p.z;
        const along = px * dx + pz * dz;
        if (along < 0 || along > bestD) continue;
        const perp = Math.abs(px * dz - pz * dx);
        if (perp < 2.2) { bestD = along; bestCar = c; bestPed = null; }
      }
      if (bestPed) {
        bestPed.health -= PLAYER.pistolDamage; bestPed.state = 'flee'; bestPed.fleeT = 5;
        if (bestPed.health <= 0) bestPed.down = true;
      }
      if (bestCar && bestCar.driver === 'police') addWanted(WANTED.ramPolice);
      addWanted(WANTED.shoot);
      return EVENT_SHOT | EVENT_CRIME;
    }
    if (ctl.reload && p.ammo < PLAYER.pistolAmmo && p.reserve > 0) {
      const need = PLAYER.pistolAmmo - p.ammo;
      const take = Math.min(need, p.reserve);
      p.ammo += take; p.reserve -= take;
    }
    return 0;
  }

  function stepDriving(dt, ctl) {
    const p = state.player;
    const car = state.cars.find((c) => c.id === p.inCar);
    if (!car) { p.inCar = null; return 0; }
    let events = 0;
    const d = ctl.drag || { dx: 0, dy: 0 };
    state.cam.yaw -= d.dx * 0.005;
    // Steering follows the car; camera yaw eases toward behind-car.
    const targetYaw = car.heading + Math.PI;
    state.cam.yaw = angLerp(state.cam.yaw, targetYaw, Math.min(1, dt * 1.2));
    const ax = ctl.ax || 0; const ay = ctl.ay || 0;
    const accel = ay > 0 ? car.accel : ay < 0 ? -car.accel * 0.7 : 0;
    car.speed += accel * dt;
    if (ay === 0) car.speed -= Math.sign(car.speed) * 6 * dt;
    if (ctl.jump) car.speed -= Math.sign(car.speed) * 22 * dt; // handbrake
    car.speed = clamp(car.speed, -car.top * 0.45, car.top);
    if (Math.abs(car.speed) < 0.05 && ay === 0) car.speed = 0;
    const steer = ax * (car.speed >= 0 ? 1 : -1) * clamp(Math.abs(car.speed) / 8, 0, 1);
    car.heading += steer * 1.9 * dt * (ctl.jump ? 1.6 : 1);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    const fixed = collideCircle(nx, nz, 1.9);
    car.x = clamp(fixed.x, -178, 178); car.z = clamp(fixed.z, -142, BEACH_Z + 28);
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
      if (Math.abs(car.speed) > 6) events |= EVENT_CRASH;
      car.speed *= 0.35;
    }
    // Hit pedestrians.
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (dist2(car.x, car.z, ped.x, ped.z) < 4.2 && Math.abs(car.speed) > 3) {
        ped.down = true; ped.health = 0; addWanted(WANTED.hitPed);
        car.speed *= 0.8; events |= EVENT_CRIME | EVENT_CRASH;
      }
    }
    // Ram other cars (wanted rises at most once per 3 s per car).
    for (const other of state.cars) {
      if (other === car) continue;
      if (dist2(car.x, car.z, other.x, other.z) < 12) {
        if (other.driver === 'police' && other.hitCooldown <= 0) {
          addWanted(WANTED.ramPolice); events |= EVENT_CRIME; other.hitCooldown = 3;
        }
        if (Math.abs(car.speed) > 8) { other.speed = car.speed * 0.5; events |= EVENT_CRASH; }
        const push = 0.4;
        const dx = car.x - other.x; const dz = car.z - other.z;
        const len = Math.hypot(dx, dz) || 1;
        other.x -= (dx / len) * push; other.z -= (dz / len) * push;
        car.speed *= 0.85;
      }
    }
    void before;
    p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = Math.abs(car.speed);
    if (ctl.enter) {
      p.inCar = null; car.driver = 'none'; car.parked = true; car.speed = 0;
      p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
      p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.driver === 'player' || car.driver === 'police') continue;
      if (car.parked) continue;
      // Slow for a car ahead on the same lane.
      let target = car.cruise;
      for (const other of state.cars) {
        if (other === car || other.parked) continue;
        const dx = other.x - car.x; const dz = other.z - car.z;
        const ahead = car.axis === 'x' ? dx * car.dir : dz * car.dir;
        const side = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
        if (ahead > 0 && ahead < 9 && side < 3) { target = Math.min(target, Math.max(0, other.speed)); break; }
      }
      car.speed += clamp(target - car.speed, -10 * dt, 8 * dt);
      let nx = car.x; let nz = car.z;
      if (car.axis === 'x') nx += car.dir * car.speed * dt;
      else nz += car.dir * car.speed * dt;
      // Turn at an intersection sometimes.
      const nearX = Math.abs(nx - Math.round(nx / PITCH) * PITCH) < 1.2;
      const nearZ = Math.abs(nz - Math.round(nz / PITCH) * PITCH) < 1.2;
      if (nearX && nearZ && random.next() < 0.012) {
        if (car.axis === 'x') {
          car.axis = 'z'; car.dir = random.next() < 0.5 ? 1 : -1;
          car.heading = car.dir > 0 ? 0 : Math.PI;
          nz = Math.round(nz / PITCH) * PITCH;
        } else {
          car.axis = 'x'; car.dir = random.next() < 0.5 ? 1 : -1;
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          nx = Math.round(nx / PITCH) * PITCH;
        }
      }
      // Wrap around the city edge.
      if (nx > 178) nx = -178; if (nx < -178) nx = 178;
      if (nz > BEACH_Z + 20) nz = -140; if (nz < -140) nz = BEACH_Z + 20;
      const fixed = collideCircle(nx, nz, 1.9);
      car.x = fixed.x; car.z = fixed.z;
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) continue;
      let speed = ped.speed;
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        if (ped.fleeT <= 0) ped.state = 'walk';
        speed = 4.2;
        const dx = ped.x - p.x; const dz = ped.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / len, dz / len);
      } else {
        // Scared by a fast car or a gunshot nearby.
        const playerCar = p.inCar ? state.cars.find((c) => c.id === p.inCar) : null;
        const threat = playerCar && Math.abs(playerCar.speed) > 6 && dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 80;
        if (threat) { ped.state = 'flee'; ped.fleeT = 3; continue; }
        // Walk along a sidewalk line; turn at intersections.
        const along = ped.axis === 'x' ? ped.x : ped.z;
        const snapped = Math.round(along / PITCH) * PITCH;
        if (Math.abs(along - snapped) < 1.0 && random.next() < 0.01) {
          ped.axis = ped.axis === 'x' ? 'z' : 'x';
          ped.dir = random.next() < 0.5 ? 1 : -1;
        }
        ped.heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
      }
      const nx = ped.x + Math.sin(ped.heading) * speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * speed * dt;
      const fixed = collideCircle(nx, nz, 0.5);
      ped.x = clamp(fixed.x, -178, 178); ped.z = clamp(fixed.z, -142, BEACH_Z + 28);
    }
  }

  function stepPolice(dt) {
    const p = state.player;
    if (state.wanted === 0) {
      // Idle cruisers drift off; remove police cars once the heat is gone.
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        if (state.cars[i].driver === 'police' && dist2(state.cars[i].x, state.cars[i].z, p.x, p.z) > 90 * 90) {
          state.cars.splice(i, 1);
        }
      }
      return;
    }
    const want = state.wanted + 1;
    if (policeCount() < want && state.time % 1 < dt * 2) spawnPolice(1);
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      const dx = p.x - car.x; const dz = p.z - car.z;
      const d = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx / d, dz / d);
      car.heading = angLerp(car.heading, wantHeading, Math.min(1, dt * 2.2));
      car.speed = clamp(car.speed + car.accel * dt, 0, car.top);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = collideCircle(nx, nz, 1.9);
      car.x = clamp(fixed.x, -178, 178); car.z = clamp(fixed.z, -142, BEACH_Z + 28);
      if (d < 3.2) {
        // Ram / arrest.
        if (p.inCar) {
          const pc = state.cars.find((c) => c.id === p.inCar);
          if (pc) pc.speed *= 0.6;
          p.health = Math.max(0, p.health - 6 * dt);
        } else {
          state.bustedTimer += dt;
          if (state.bustedTimer > 1.4) return; // caller converts to EVENT_BUSTED via busted flag
        }
      }
    }
  }

  function stepMissions(dt) {
    const m = currentMission();
    if (!m) return 0;
    const s = currentStage();
    if (!s) return 0;
    if (s.timer) {
      state.stageTimer -= dt;
      if (state.stageTimer <= 0) return failStage(`Out of time on “${m.name}” — the client walked away. Try again.`);
    }
    const wp = waypoint();
    if (!wp) return 0;
    const p = state.player;
    const d = Math.hypot(p.x - wp.x, p.z - wp.z);
    if (s.kind === 'goto' && d < 6) {
      state.passenger = s.target === 'pier' ? true : state.passenger;
      if (s.target === 'docks') state.hasPackage = true;
      return completeStage();
    }
    if (s.kind === 'drive' && d < 7 && p.inCar) return completeStage();
    if (s.kind === 'steal') {
      const gt = state.cars.find((c) => c.type === 'sports' && Math.abs(c.x - PLACES.marina.x) < 12 && Math.abs(c.z - PLACES.marina.z) < 12);
      if (gt && gt.driver === 'player') {
        addWanted(1);
        return completeStage();
      }
    }
    if (s.kind === 'loseheat' && state.wanted === 0) return completeStage();
    return 0;
  }

  function step(dt, ctl = {}) {
    let events = 0;
    state.time += dt;
    for (const c of state.cars) if (c.hitCooldown > 0) c.hitCooldown -= dt;
    state.clock = (8.0 + state.time / 240) % 24; // a full day in 4 game-hours of play... slow drift
    if (state.dusk) state.clock = 18.6;
    events |= stepPlayer(dt, ctl);
    stepTraffic(dt);
    stepPeds(dt);
    stepPolice(dt);
    events |= stepMissions(dt);
    // Wanted decay: hidden from every police car for a while.
    if (state.wanted > 0) {
      let seen = false;
      for (const c of state.cars) {
        if (c.driver !== 'police') continue;
        if (dist2(c.x, c.z, state.player.x, state.player.z) < 55 * 55) { seen = true; break; }
      }
      if (!seen && state.time - state.lastCrime > WANTED.decayDelay) {
        state.heatTimer += dt;
        if (state.heatTimer > 4) { state.wanted = Math.max(0, state.wanted - 1); state.heatTimer = 0; state.lastCrime = state.time; }
      } else {
        state.heatTimer = 0;
      }
    }
    if (state.bustedTimer > 1.4 && state.wanted > 0 && !state.player.inCar) events |= EVENT_BUSTED;
    if (state.player.health <= 0) events |= EVENT_DEAD;
    return events;
  }

  function save() {
    const p = state.player;
    return {
      cash: p.cash, health: p.health, ammo: p.ammo, reserve: p.reserve,
      x: p.x, z: p.z, missionIdx: state.missionIdx, stageIdx: state.stageIdx,
      wanted: state.wanted, clock: state.clock,
    };
  }
  function load(data) {
    if (!data) return false;
    reset();
    const p = state.player;
    p.cash = data.cash || 0; p.health = data.health || PLAYER.maxHealth;
    p.ammo = data.ammo ?? PLAYER.pistolAmmo; p.reserve = data.reserve ?? 48;
    p.x = data.x ?? 0; p.z = data.z ?? 60;
    state.missionIdx = data.missionIdx || 0; state.stageIdx = data.stageIdx || 0;
    state.wanted = data.wanted || 0; state.clock = data.clock || 8.0;
    const s = currentStage();
    if (s && s.timer) state.stageTimer = s.timer;
    return true;
  }

  reset();
  return {
    state, reset, step, save, load, currentMission, currentStage, waypoint,
    objectiveText, nearestCar, addWanted, spawnPolice, collideCircle,
  };
}

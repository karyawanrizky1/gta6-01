// Screenshot scenes behind ?shot=chase|title|mission|dusk. Each one plays the real rules
// forward from a fresh seeded world with a scripted driver, so the frame is what the real
// game looks like and the same seed always gives the same frame.
import { STEP, PLACES } from './config.js';

const DRIVE = { ax: 0, ay: 1, run: false, jump: false, enter: false, punch: false, shoot: false, reload: false, drag: { dx: 0, dy: 0 } };

function putPlayerInCar(world, type, x, z, heading) {
  const s = world.state;
  let car = s.cars.find((c) => c.type === type && c.driver === 'none');
  if (!car) car = s.cars.find((c) => c.driver === 'none');
  car.x = x; car.z = z; car.heading = heading; car.driver = 'player'; car.parked = false; car.speed = 18;
  s.player.inCar = car.id; s.player.x = x; s.player.z = z; s.player.heading = heading;
  return car;
}

function driveSteps(world, seconds, steerFn) {
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    const ctl = { ...DRIVE };
    if (steerFn) steerFn(ctl, i);
    world.step(STEP, ctl);
  }
}

function walkSteps(world, seconds, ctlFn) {
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    world.step(STEP, ctlFn ? ctlFn(i) : { ax: 0, ay: 0, run: false, jump: false, enter: false, punch: false, shoot: false, reload: false, drag: { dx: 0, dy: 0 } });
  }
}

/**
 * Stage the named scene on `world` and return { screen, dusk }:
 * screen is 'title' (title menu over the living city) or 'play'.
 */
export function stageShot(name, world) {
  const s = world.state;
  if (name === 'title') {
    world.reset();
    // Living city behind the title: Jay on the beach looking north at the skyline,
    // palms and traffic rolling for 6 seconds.
    s.player.x = -60; s.player.z = 148; s.player.heading = 0;
    s.cam.yaw = Math.PI; s.cam.pitch = 0.24; s.cam.dist = 14;
    walkSteps(world, 6, () => ({ ...DRIVE, ay: 0 }));
    return { screen: 'title', dusk: false };
  }
  if (name === 'mission') {
    world.reset();
    // Mission 3 in progress: Jay on foot at the East Docks, the yellow package
    // beacon straight ahead across the open dock lot.
    s.missionIdx = 2; s.stageIdx = 0;
    s.player.x = 144; s.player.z = -12; // off the z=-17 lamp line so no pole blocks the shot
    s.player.heading = Math.PI / 2;
    s.cam.yaw = Math.PI / 2; s.cam.pitch = 0.32; s.cam.dist = 8;
    s.player.cash = 700;
    walkSteps(world, 1, (i) => ({ ...DRIVE, ay: i < 30 ? 1 : 0, ax: 0 }));
    return { screen: 'play', dusk: false };
  }
  if (name === 'dusk') {
    world.reset();
    s.dusk = true;
    s.player.cash = 1150;
    putPlayerInCar(world, 'sports', -100, 102, Math.PI / 2); // coast road (z=102), not a block
    s.cam.yaw = Math.PI * 1.5; s.cam.pitch = 0.22;
    driveSteps(world, 5, (ctl) => {
      ctl.ax = Math.max(-0.6, Math.min(0.6, (s.player.z - 102) * 0.08));
    });
    const dc = s.cars.find((c) => c.id === s.player.inCar);
    if (dc) { dc.z = 102; dc.heading = Math.PI / 2; dc.speed = 26; s.player.z = 102; s.player.heading = Math.PI / 2; }
    s.wanted = 0; // calm dusk cruise, no heat
    s.cam.yaw = Math.PI * 1.5; s.cam.pitch = 0.3; s.cam.dist = 12;
    return { screen: 'play', dusk: true };
  }
  // Default: 'chase' — the cover. 2 stars, two police cruisers on Jay's tail, driving
  // the Comet GT down the coast road with the mission objective on screen.
  world.reset();
  s.missionIdx = 1; s.stageIdx = 1; // Hot Wheels: lose the heat
  s.wanted = 2; s.lastCrime = 0; // set before the drive so 'loseheat' cannot complete early
  s.player.cash = 450;
  const car = putPlayerInCar(world, 'sports', -60, 102, Math.PI / 2);
  void car;
  world.spawnPolice(2);
  for (const c of s.cars) {
    if (c.driver === 'police') { c.x = s.player.x - 14; c.z = s.player.z + 6; c.speed = 20; }
  }
  s.cam.yaw = Math.PI * 1.5; s.cam.pitch = 0.25;
  // Road-following driver: steer back toward the coast road (z=102) so the car
  // stays on the open road instead of drifting into the blocks.
  driveSteps(world, 4, (ctl) => {
    ctl.ax = Math.max(-0.6, Math.min(0.6, (s.player.z - 102) * 0.08)) + Math.sin(s.time) * 0.05;
  });
  // Final framing: Comet GT on the coast road at speed, police right behind it,
  // camera low behind the car.
  const pc = s.cars.find((c) => c.id === s.player.inCar);
  if (pc) { pc.z = 102; pc.heading = Math.PI / 2; pc.speed = 26; s.player.z = 102; s.player.heading = Math.PI / 2; }
  let pi = 0;
  for (const c of s.cars) {
    if (c.driver === 'police') { c.x = s.player.x - 16 - pi * 8; c.z = 102 + (pi === 0 ? -5 : 5); c.heading = Math.PI / 2; c.speed = 26; pi += 1; }
  }
  s.cam.yaw = Math.PI * 1.5; s.cam.pitch = 0.34; s.cam.dist = 11;
  // Pin the cover at exactly 2 stars after the drive (rams during the chase can add heat).
  s.wanted = 2; s.lastCrime = s.time; s.heatTimer = 0;
  return { screen: 'play', dusk: false };
}

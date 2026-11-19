// Drawing only: three.js scene synced from the world state each frame, plus the 2D minimap.
// No game rules here. Golden-hour sun, a procedural window texture, and shared geometries
// keep the frame cheap enough for software WebGL.
import * as THREE from 'three';
import { CITY_W, CITY_H, X0, Z0, BEACH_Z, SEA_Z, PLACES, PITCH, roadX, roadZ, COLS, ROWS } from './config.js';

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#20242e';
  for (let y = 10; y < 246; y += 22) for (let x = 10; x < 118; x += 20) g.fillRect(x, y, 12, 14);
  g.fillStyle = '#ffd98a';
  for (let y = 10; y < 246; y += 22) for (let x = 10; x < 118; x += 20) {
    if (((x * 7 + y * 13) % 5) === 0) g.fillRect(x, y, 12, 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const headGeo = new THREE.SphereGeometry(0.32, 10, 8);
const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6);
const palmGeo = new THREE.SphereGeometry(1.5, 8, 6);
const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.transparent || ''}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
function box(parent, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  parent.add(m); return m;
}

export function createRenderer(canvas, minimapCanvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xffc98a, 180, 520);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(-120, 90, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a6a4a, 0.9));

  const winTex = windowTexture();
  const cityGroup = new THREE.Group(); scene.add(cityGroup);
  const dynGroup = new THREE.Group(); scene.add(dynGroup);
  let lastBuildings = null;
  const carMeshes = new Map();
  const pedMeshes = [];
  const playerGroup = new THREE.Group(); dynGroup.add(playerGroup);
  const pBody = box(playerGroup, 0.7, 1.0, 0.42, 0, 0.9, 0, mat(0x2f8f7a));
  const pHead = new THREE.Mesh(headGeo, mat(0xe8b98a)); pHead.position.set(0, 1.65, 0); playerGroup.add(pHead);
  const pLegs = box(playerGroup, 0.6, 0.5, 0.36, 0, 0.25, 0, mat(0x2a2f3a));
  void pBody; void pLegs;
  // Waypoint beacon: glowing column + floating diamond.
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 13; beacon.add(beam);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  gem.position.y = 6; beacon.add(gem);
  scene.add(beacon);
  // Tracer for gunshots.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
  tracer.visible = false; scene.add(tracer);
  let tracerT = 0;

  function buildCity(buildings, trees) {
    while (cityGroup.children.length) cityGroup.remove(cityGroup.children[0]);
    // Ground: city slab, beach sand, sea.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_W + 40, CITY_H + 40), mat(0x9aa0a8));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0); cityGroup.add(ground);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY_W + 40, 44), mat(0xe8d29a));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.01, BEACH_Z + 22); cityGroup.add(sand);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(CITY_W + 60, 120), mat(0x2f7fb5));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, SEA_Z + 60); cityGroup.add(sea);
    // Roads: dark strips on the grid lines.
    const roadMat = mat(0x3a3f47);
    for (let k = 0; k <= COLS; k += 1) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(10, CITY_H + 20), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(roadX(k), 0.02, 0); cityGroup.add(r);
    }
    for (let k = 0; k <= ROWS; k += 1) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(CITY_W + 20, 10), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.02, roadZ(k)); cityGroup.add(r);
    }
    // Centre dashes.
    const dashMat = mat(0xf2e9c8);
    for (let k = 0; k <= COLS; k += 1) {
      for (let z = Z0 + 8; z < CITY_H / 2; z += 12) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), dashMat);
        d.rotation.x = -Math.PI / 2; d.position.set(roadX(k), 0.03, z); cityGroup.add(d);
      }
    }
    // Park: green square + pond; plaza: pale stone; airstrip: runway strip.
    const park = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), mat(0x6fae5e));
    park.rotation.x = -Math.PI / 2; park.position.set(17, 0.03, 17); cityGroup.add(park);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), mat(0xd8cdb4));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(-17, 0.03, -17); cityGroup.add(plaza);
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(16, 120), mat(0x2c2f36));
    runway.rotation.x = -Math.PI / 2; runway.position.set(153, 0.03, -85); cityGroup.add(runway);
    // Pier: wooden deck reaching into the sea.
    const pierMat = mat(0x9a7a52);
    for (let z = BEACH_Z + 4; z < BEACH_Z + 30; z += 2) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.8), pierMat);
      p.rotation.x = -Math.PI / 2; p.position.set(PLACES.pier.x, 0.15, z); cityGroup.add(p);
    }
    // Buildings with lit windows.
    const bmat = new Map();
    for (const b of buildings) {
      if (!bmat.has(b.color)) {
        bmat.set(b.color, new THREE.MeshLambertMaterial({ color: b.color, map: winTex }));
      }
      const m = new THREE.Mesh(boxGeo, bmat.get(b.color));
      m.scale.set(b.w, b.h, b.d); m.position.set(b.x, b.h / 2, b.z);
      cityGroup.add(m);
      box(cityGroup, b.w * 0.7, 0.8, b.d * 0.7, b.x, b.h + 0.4, b.z, mat(0x5a5f68)); // rooftop box
    }
    // Palm trees.
    const trunkMat = mat(0x8a6a42); const leafMat = mat(0x3f8f4f);
    for (const t of trees) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(t.x, 1.3 * t.s, t.z); trunk.scale.setScalar(t.s); cityGroup.add(trunk);
      const crown = new THREE.Mesh(palmGeo, leafMat);
      crown.position.set(t.x, 3.1 * t.s, t.z); crown.scale.set(t.s * 1.4, t.s * 0.7, t.s * 1.4); cityGroup.add(crown);
    }
    // Street lamps along the main roads, at block centres so no pole stands in a driving lane.
    const poleMat = mat(0x30343c); const lampMat = mat(0xffe9a8, { emissive: 0xffdf8a });
    for (let k = 1; k < COLS; k += 2) {
      for (const z of [-85, -17, 51]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5, 6), poleMat);
        pole.position.set(roadX(k) + 5.4, 2.5, z); cityGroup.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
        lamp.position.set(roadX(k) + 5.4, 5.1, z); cityGroup.add(lamp);
      }
    }
    // Marina docks + containers at the east docks.
    const dockMat = mat(0x7a6a52);
    for (let i = 0; i < 4; i += 1) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 24), dockMat);
      d.rotation.x = -Math.PI / 2; d.position.set(158 + i * 0, 0.06, 60 + i * 14); cityGroup.add(d);
    }
    const contColors = [0xc65a3a, 0x3a7ac6, 0x4a9a5a];
    for (let i = 0; i < 6; i += 1) {
      box(cityGroup, 6, 2.6, 2.6, 150 + (i % 2) * 8, 1.3, -60 + Math.floor(i / 2) * 8, mat(contColors[i % 3]));
    }
  }

  function makeCarMesh(car) {
    const g = new THREE.Group();
    const bodyMat = mat(car.color);
    const isSports = car.type === 'sports';
    const len = car.type === 'truck' || car.type === 'van' ? 5.2 : 4.4;
    const h = isSports ? 0.75 : 1.0;
    box(g, 2.0, h, len, 0, 0.75, 0, bodyMat);
    box(g, 1.7, 0.7, len * 0.45, 0, 0.75 + h / 2 + 0.35, -len * 0.05, mat(0x1c2733));
    // Wheels.
    const wmat = mat(0x14161a);
    for (const [wx, wz] of [[-1.0, len * 0.32], [1.0, len * 0.32], [-1.0, -len * 0.32], [1.0, -len * 0.32]]) {
      const w = new THREE.Mesh(wheelGeo, wmat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w);
    }
    // Headlights + taillights.
    box(g, 0.4, 0.2, 0.1, -0.6, 0.8, len / 2, mat(0xfff2b0, { emissive: 0xffedb0 }));
    box(g, 0.4, 0.2, 0.1, 0.6, 0.8, len / 2, mat(0xfff2b0, { emissive: 0xffedb0 }));
    box(g, 0.4, 0.2, 0.1, -0.6, 0.8, -len / 2, mat(0xc22a2a, { emissive: 0x881111 }));
    box(g, 0.4, 0.2, 0.1, 0.6, 0.8, -len / 2, mat(0xc22a2a, { emissive: 0x881111 }));
    if (car.type === 'taxi') box(g, 1.2, 0.25, 0.7, 0, 1.85, 0, mat(0xf2c230, { emissive: 0x8a6d00 }));
    if (car.type === 'police') {
      const bar = box(g, 1.4, 0.22, 0.5, 0, 1.8, -0.2, mat(0xffffff));
      bar.name = 'lightbar';
      box(g, 1.9, 0.5, 0.1, 0, 1.0, len / 2 + 0.02, mat(0xffffff));
    }
    return g;
  }

  function makePedMesh(ped) {
    const g = new THREE.Group();
    box(g, 0.62, 0.95, 0.36, 0, 0.85, 0, mat(ped.shirt));
    const head = new THREE.Mesh(headGeo, mat(0xe8b98a));
    head.position.set(0, 1.55, 0); g.add(head);
    box(g, 0.5, 0.45, 0.32, 0, 0.22, 0, mat(0x2a2f3a));
    return g;
  }

  function resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  function draw(state, time) {
    if (state.buildings !== lastBuildings) {
      buildCity(state.buildings, state.trees);
      lastBuildings = state.buildings;
    }
    // Dusk vs golden hour lighting.
    const dusk = state.dusk || state.clock > 17.5;
    if (dusk) {
      scene.background.set(0x7a4a6e); scene.fog.color.set(0x7a4a6e);
      sun.color.set(0xff8a5a); sun.intensity = 1.5; sun.position.set(60, 28, 90);
    } else {
      scene.background.set(0xffc98a); scene.fog.color.set(0xffc98a);
      sun.color.set(0xffd9a0); sun.intensity = 2.4; sun.position.set(-120, 90, 60);
    }
    const p = state.player;
    // Cars.
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car.id);
      let mesh = carMeshes.get(car.id);
      if (!mesh) { mesh = makeCarMesh(car); dynGroup.add(mesh); carMeshes.set(car.id, mesh); }
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
      if (car.driver === 'police') {
        const bar = mesh.getObjectByName('lightbar');
        if (bar) bar.material = mat((Math.floor(time * 4) % 2 === 0) ? 0xff2222 : 0x2244ff, { emissive: 0xffffff });
      }
    }
    for (const [id, mesh] of [...carMeshes]) {
      if (!seen.has(id)) { dynGroup.remove(mesh); carMeshes.delete(id); }
    }
    // Pedestrians.
    while (pedMeshes.length < state.peds.length) {
      const m = makePedMesh(state.peds[pedMeshes.length]);
      dynGroup.add(m); pedMeshes.push(m);
    }
    state.peds.forEach((ped, i) => {
      const m = pedMeshes[i];
      m.visible = true;
      m.position.set(ped.x, ped.down ? 0.25 : 0, ped.z);
      m.rotation.y = ped.heading;
      if (ped.down) { m.rotation.x = Math.PI / 2; m.position.y = 0.3; }
      else m.rotation.x = 0;
      // Walk bob.
      if (!ped.down && ped.state === 'walk') m.position.y = Math.abs(Math.sin(time * 6 + i)) * 0.06;
    });
    // Player on foot.
    const inCar = p.inCar !== null && p.inCar !== undefined;
    playerGroup.visible = !inCar;
    if (!inCar) {
      playerGroup.position.set(p.x, p.y, p.z);
      playerGroup.rotation.y = p.heading;
      playerGroup.position.y = p.y + (p.speed > 0.5 ? Math.abs(Math.sin(time * 10)) * 0.08 : 0);
    }
    // Waypoint beacon.
    const wp = state._waypoint;
    if (wp) {
      beacon.visible = true;
      beacon.position.set(wp.x, 0, wp.z);
      gem.position.y = 6 + Math.sin(time * 2) * 0.5;
      gem.rotation.y = time;
    } else {
      beacon.visible = false;
    }
    // Tracer fade.
    if (tracerT > 0) { tracerT -= 1 / 60; if (tracerT <= 0) tracer.visible = false; }
    // Camera: orbit behind the player / car.
    const cam = state.cam;
    const tx = p.x; const tz = p.z;
    const dist = cam.dist;
    const cx = tx - Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
    const cz = tz - Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
    const cy = 2 + Math.sin(cam.pitch) * dist;
    camPos.set(cx, cy, cz);
    camTarget.set(tx, 1.6, tz);
    camera.position.lerp(camPos, 0.35);
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  function shootTracer(from, to) {
    const pos = tracerGeo.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    tracerGeo.attributes.position.needsUpdate = true;
    tracer.visible = true; tracerT = 0.12;
  }

  // Minimap: top-down 2D view on the HUD canvas.
  function drawMinimap(state, waypoint) {
    if (!minimapCanvas) return;
    const ctx = minimapCanvas.getContext('2d');
    const W = minimapCanvas.width; const H = minimapCanvas.height;
    const sx = W / 400; const sz = H / 340;
    const X = (x) => (x + 200) * sx;
    const Z = (z) => (z + 170) * sz;
    ctx.fillStyle = '#0e1a24'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2f7fb5'; ctx.fillRect(0, Z(BEACH_Z), W, H - Z(BEACH_Z)); // sea
    ctx.fillStyle = '#e8d29a'; ctx.fillRect(0, Z(BEACH_Z), W, Z(SEA_Z) - Z(BEACH_Z)); // beach
    ctx.fillStyle = '#9aa0a8'; ctx.fillRect(X(X0), Z(Z0), CITY_W * sx, CITY_H * sz); // city slab
    ctx.fillStyle = '#3a3f47';
    for (let k = 0; k <= COLS; k += 1) ctx.fillRect(X(roadX(k)) - 5 * sx, Z(Z0), 10 * sx, CITY_H * sz);
    for (let k = 0; k <= ROWS; k += 1) ctx.fillRect(X(X0), Z(roadZ(k)) - 5 * sz, CITY_W * sx, 10 * sz);
    ctx.fillStyle = '#6fae5e'; ctx.fillRect(X(4), Z(4), 26 * sx, 26 * sz); // park
    ctx.fillStyle = '#5a5f68';
    for (const b of state.buildings) ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
    if (waypoint) {
      ctx.fillStyle = '#ffd23f';
      ctx.save(); ctx.translate(X(waypoint.x), Z(waypoint.z)); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-7, -7, 14, 14); ctx.restore();
    }
    for (const car of state.cars) {
      ctx.fillStyle = car.driver === 'police' ? '#ff3b30' : car.driver === 'player' ? '#37d67a' : '#c8ccd4';
      ctx.beginPath(); ctx.arc(X(car.x), Z(car.z), car.driver === 'police' ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const p = state.player;
    ctx.save(); ctx.translate(X(p.x), Z(p.z)); ctx.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  return { draw, drawMinimap, shootTracer };
}

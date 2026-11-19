// Solmara Bay — shared tuning and city layout. All names, places and people are original.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmara-save-v1';
export const BEST_KEY = 'solmara-best-cash';

// City grid: 10 columns x 8 rows of blocks. Roads run between blocks.
export const BLOCK = 24;          // building block size (m)
export const ROAD = 10;           // road width (m)
export const PITCH = BLOCK + ROAD; // 34 m between block centres
export const COLS = 10;
export const ROWS = 8;
export const CITY_W = COLS * PITCH;   // 340
export const CITY_H = ROWS * PITCH;   // 272
export const X0 = -CITY_W / 2;        // west edge
export const Z0 = -CITY_H / 2;        // north edge
// South edge is the beach: sand from z = CITY_H/2 to +34, then the sea.
export const BEACH_Z = CITY_H / 2;
export const SEA_Z = BEACH_Z + 34;

// Block centre for column i, row j.
export function blockCentre(i, j) {
  return { x: X0 + PITCH / 2 + i * PITCH, z: Z0 + PITCH / 2 + j * PITCH };
}
// Road centre lines (between blocks, plus the outer ring roads).
export function roadX(k) { return X0 + k * PITCH; }      // k = 0..COLS, vertical roads
export function roadZ(k) { return Z0 + k * PITCH; }      // k = 0..ROWS, horizontal roads

// Named places (all original).
export const PLACES = {
  pier:      { x: -34, z: BEACH_Z + 26, label: 'Sunset Pier' },
  hotel:     { x: 119, z: 85,  label: 'Hotel Miramar' },
  marina:    { x: 153, z: 102, label: 'Marina — Comet GT' },
  docks:     { x: 153, z: -17, label: 'East Docks' },
  airstrip:  { x: 136, z: -119, label: 'Solmara Airstrip' },
  park:      { x: 17,  z: 17,  label: 'Palm Court Park' },
  plaza:     { x: -17, z: -17, label: 'Old Plaza' },
  policeHQ:  { x: -119, z: -85, label: 'Police HQ' },
};

export const MISSIONS = [
  {
    id: 1, name: 'First Fare', pay: 250,
    brief: 'A client is waiting on Sunset Pier. Pick her up and drive her to Hotel Miramar before the meter runs out.',
    stages: [
      { kind: 'goto', target: 'pier', text: 'Pick up the client at Sunset Pier' },
      { kind: 'drive', target: 'hotel', text: 'Drive the client to Hotel Miramar', timer: 90 },
    ],
  },
  {
    id: 2, name: 'Hot Wheels', pay: 450,
    brief: 'An orange Comet GT is parked at the marina. Take it — and then lose the heat before you bring it home.',
    stages: [
      { kind: 'steal', target: 'marina', text: 'Steal the orange Comet GT at the marina' },
      { kind: 'loseheat', target: 'park', text: 'Lose the wanted level (hide from the police)' },
    ],
  },
  {
    id: 3, name: 'The Harbor Job', pay: 800,
    brief: 'Pick up the package at the East Docks and run it to Solmara Airstrip. The whole harbour will be watching.',
    stages: [
      { kind: 'goto', target: 'docks', text: 'Pick up the package at the East Docks' },
      { kind: 'drive', target: 'airstrip', text: 'Deliver the package to Solmara Airstrip — 3 stars, no stopping', wanted: 3 },
    ],
  },
];

export const CAR_TYPES = {
  sedan:  { name: 'Solmar Sedan',  top: 34, accel: 16, color: 0x4a7fb5 },
  taxi:   { name: 'Bay Taxi',      top: 32, accel: 15, color: 0xf2c230 },
  van:    { name: 'Harbor Van',    top: 28, accel: 11, color: 0xd8d8d8 },
  sports: { name: 'Comet GT',      top: 52, accel: 26, color: 0xe8641c },
  truck:  { name: 'Dune Truck',    top: 30, accel: 13, color: 0x7a4a2b },
  police: { name: 'SBP Cruiser',   top: 44, accel: 22, color: 0x1c2f6e },
};

export const PLAYER = {
  walkSpeed: 5.2, runSpeed: 9.5, jumpSpeed: 7.5, maxHealth: 100,
  pistolAmmo: 24, pistolDamage: 34, punchDamage: 20, punchRange: 2.2,
};

export const WANTED = {
  steal: 1, shoot: 1, hitPed: 1, ramPolice: 1,
  decayDelay: 9, decayRate: 0.12, // heat per second once hidden
};

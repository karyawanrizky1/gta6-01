// Seeded random: mulberry32. Same seed, same city, same traffic — screenshots are reproducible.
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(lo, hi) { return lo + this.next() * (hi - lo); },
    int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
  };
}

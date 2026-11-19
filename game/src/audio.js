// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum follows speed, a two-tone siren wails while wanted, plus gunshot,
// punch, pickup chime and a slow original chord-pad + bass loop.
export function createAudio() {
  let ctx = null; let master = null; let engineOsc = null; let engineGain = null;
  let sirenOsc = null; let sirenGain = null; let musicTimer = null;
  let muted = false; let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch { return false; }
  }

  // Original progression: Am – F – C – G, pad + soft bass, one chord per bar.
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 261.6, 329.6], [196, 246.9, 293.7]];
  function startMusic() {
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) return;
      const chord = CHORDS[musicStep % CHORDS.length]; musicStep += 1;
      const t = ctx.currentTime;
      for (const f of chord) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + 2.6);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.7);
      }
      const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = chord[0] / 2;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.09, t + 0.3);
      bg.gain.linearRampToValueAtTime(0.0001, t + 2.6);
      b.connect(bg); bg.connect(master); b.start(t); b.stop(t + 2.7);
    }, 2800);
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
  }

  function noise(dur, vol, freq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    isMuted() { return muted; },
    engine(speed01, on) {
      if (!ctx) return;
      engineGain.gain.value = on ? 0.03 + speed01 * 0.05 : 0;
      engineOsc.frequency.value = 50 + speed01 * 130;
    },
    siren(on, t) {
      if (!ctx) return;
      sirenGain.gain.value = on ? 0.035 : 0;
      if (on) sirenOsc.frequency.value = 650 + 250 * Math.sin(t * 4.5);
    },
    gunshot() { noise(0.14, 0.4, 3200); blip(160, 0.1, 'square', 0.2, 60); },
    punch() { noise(0.08, 0.25, 900); },
    chime() { blip(880, 0.18, 'sine', 0.18); window.setTimeout(() => blip(1318, 0.3, 'sine', 0.18), 110); },
    crash() { noise(0.25, 0.35, 700); },
    pickup() { blip(660, 0.12, 'sine', 0.18); window.setTimeout(() => blip(990, 0.22, 'sine', 0.18), 90); },
    busted() { blip(440, 0.5, 'sawtooth', 0.2, 110); },
    dispose() { if (musicTimer) window.clearInterval(musicTimer); if (ctx) ctx.close().catch(() => {}); },
  };
}

// Synthesized robot sounds using Web Audio API — no files needed

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function gain(ac, value, time) {
  const g = ac.createGain();
  g.gain.setValueAtTime(value, time ?? ac.currentTime);
  return g;
}

// Short electronic beep
function beep(freq = 520, duration = 0.12, vol = 0.18) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = gain(ac, 0);
  osc.connect(g);
  g.connect(ac.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  g.gain.linearRampToValueAtTime(vol, ac.currentTime + 0.01);
  g.gain.setValueAtTime(vol, ac.currentTime + duration - 0.03);
  g.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration + 0.01);
}

// Descending boop
function boop() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = gain(ac, 0);
  osc.connect(g);
  g.connect(ac.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(680, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.18);
  g.gain.linearRampToValueAtTime(0.15, ac.currentTime + 0.01);
  g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.2);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.22);
}

// Ascending chirp
function chirp() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = gain(ac, 0);
  osc.connect(g);
  g.connect(ac.destination);
  osc.type = 'square';
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1200;
  osc.connect(f);
  f.connect(g);
  osc.disconnect(g);
  osc.frequency.setValueAtTime(300, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.09);
  g.gain.linearRampToValueAtTime(0.08, ac.currentTime + 0.01);
  g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.1);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.12);
}

// Mechanical whirr / gear spin
function whirr(duration = 0.35) {
  const ac = getCtx();
  const bufSize = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    // Modulated noise for mechanical feel
    const t = i / ac.sampleRate;
    data[i] = (Math.random() * 2 - 1) * 0.3 * Math.sin(t * 80 * Math.PI * 2);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 400;
  f.Q.value = 3;
  const g = gain(ac, 0);
  src.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  g.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.05);
  g.gain.setValueAtTime(0.22, ac.currentTime + duration - 0.08);
  g.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
  src.start(ac.currentTime);
}

// Double blip (R2D2-style acknowledgement)
function blip() {
  beep(880, 0.07, 0.12);
  setTimeout(() => beep(1100, 0.07, 0.12), 90);
}

// Hiccup — a surprised stutter
function hiccup() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = gain(ac, 0);
  osc.connect(g);
  g.connect(ac.destination);
  osc.type = 'sawtooth';
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 800;
  osc.connect(f);
  f.connect(g);
  osc.disconnect(g);
  osc.frequency.setValueAtTime(440, ac.currentTime);
  osc.frequency.setValueAtTime(220, ac.currentTime + 0.04);
  g.gain.linearRampToValueAtTime(0.14, ac.currentTime + 0.005);
  g.gain.setValueAtTime(0.14, ac.currentTime + 0.04);
  g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.08);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.1);
}

// Thinking hum — plays while processing
let thinkOsc = null;
let thinkGain = null;

export function startThinkingHum() {
  try {
    const ac = getCtx();
    thinkOsc = ac.createOscillator();
    thinkGain = gain(ac, 0);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    thinkOsc.type = 'sawtooth';
    thinkOsc.frequency.setValueAtTime(180, ac.currentTime);
    thinkOsc.frequency.linearRampToValueAtTime(220, ac.currentTime + 1.5);
    thinkOsc.frequency.linearRampToValueAtTime(180, ac.currentTime + 3);
    thinkOsc.connect(f);
    f.connect(thinkGain);
    thinkGain.connect(ac.destination);
    thinkGain.gain.linearRampToValueAtTime(0.06, ac.currentTime + 0.2);
    thinkOsc.start(ac.currentTime);
  } catch (e) { /* ignore */ }
}

export function stopThinkingHum() {
  try {
    if (thinkGain) {
      thinkGain.gain.linearRampToValueAtTime(0, getCtx().currentTime + 0.15);
      setTimeout(() => { try { thinkOsc?.stop(); } catch(e){} thinkOsc = null; thinkGain = null; }, 200);
    }
  } catch (e) { /* ignore */ }
}

// Random idle sounds — call this on a timer
const idleSounds = [beep, boop, chirp, blip, hiccup, whirr];
const idleWeights = [3, 2, 2, 2, 1, 1]; // hiccup and whirr less frequent

export function playRandomIdleSound() {
  try {
    const total = idleWeights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < idleSounds.length; i++) {
      r -= idleWeights[i];
      if (r <= 0) { idleSounds[i](); return; }
    }
  } catch (e) { /* ignore if audio not ready */ }
}

export function playStartupChime() {
  try {
    setTimeout(() => beep(523, 0.1, 0.15), 0);
    setTimeout(() => beep(659, 0.1, 0.15), 120);
    setTimeout(() => beep(784, 0.15, 0.18), 240);
  } catch (e) { /* ignore */ }
}

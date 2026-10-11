// Âm thanh tạo bằng Web Audio, không cần file. iPhone chỉ cho phát sau lần chạm đầu tiên.

let ctx = null;
let enabled = true;

export function setEnabled(v) { enabled = v; }

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* trình duyệt không hỗ trợ */ }
}

function tone(freq, at, dur, { type = 'sine', gain = 0.08, slideTo } = {}) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  tick() { tone(1568, 0, 0.06, { gain: 0.05 }); tone(2093, 0.015, 0.05, { gain: 0.025 }); },
  back() { tone(988, 0, 0.06, { gain: 0.04, slideTo: 660 }); },
  correct() { [1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.07, 0.18, { type: 'triangle', gain: 0.09 })); },
  wrong() { tone(260, 0, 0.16, { type: 'triangle', gain: 0.1, slideTo: 170 }); tone(200, 0.12, 0.18, { type: 'triangle', gain: 0.07, slideTo: 140 }); },
  hint() { tone(1175, 0, 0.08, { gain: 0.05 }); tone(1480, 0.06, 0.1, { gain: 0.05 }); },
  done() { [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: 'triangle', gain: 0.08 })); },
};

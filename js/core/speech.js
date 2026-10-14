// Phát âm bằng giọng có sẵn trên máy (speechSynthesis). Không tốn phí, không cần mạng trên đa số máy.

const LANG = { us: 'en-US', uk: 'en-GB' };
let voices = [];

function refresh() {
  try { voices = window.speechSynthesis.getVoices(); } catch { voices = []; }
}

if ('speechSynthesis' in window) {
  refresh();
  window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
}

const norm = (l) => (l || '').replace('_', '-').toLowerCase();

function pickVoice(accent) {
  const lang = norm(LANG[accent]);
  const match = voices.filter((v) => norm(v.lang) === lang);
  // Giọng "Google"/"Natural"/"Enhanced" thường nghe tự nhiên hơn.
  const better = match.find((v) => /natural|google|enhanced|premium|siri/i.test(v.name));
  return better || match[0] || null;
}

export function hasAccent(accent) {
  refresh();
  return !!pickVoice(accent);
}

export function speak(text, accent = 'us', rate = 0.9) {
  if (!('speechSynthesis' in window)) return false;
  refresh();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(accent) || pickVoice(accent === 'uk' ? 'us' : 'uk');
  if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = LANG[accent]; }
  u.rate = rate;
  synth.speak(u);
  return true;
}

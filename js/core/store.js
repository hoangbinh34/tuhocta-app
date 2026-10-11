// Trạng thái app trên máy (localStorage), chia theo hồ sơ người học (chị cấp 3, em cấp 1…),
// + hàng đợi gửi lên Google Sheet (nối ở M3).

import { mergeCap, sameCap } from './level.js';

const KEY = 'tuhocta.v2';
const OLD_KEY = 'tuhocta.v1';

const defaultSettings = () => ({
  name: '',
  voice: 'us',        // 'us' | 'uk'
  sound: true,
  palette: 'mint',    // 'mint' | 'peach' | 'ocean'
  theme: 'auto',      // 'auto' | 'light' | 'dark'
  dailyGoal: 30,
  sessionSize: 12,
  mascotName: 'Mít',
  extended: false,    // có học từ "mở rộng" (priority 3) không
});

const emptyProfile = (id, track) => ({
  id,
  track,              // 'thpt' | 'tieuhoc'
  createdAt: Date.now(),
  settings: defaultSettings(),
  progress: {},       // wordId -> { box, dueAt, seen, wrong, lastAt }
  sessions: [],
  feedback: [],
  daily: {},          // 'YYYY-MM-DD' -> { words, seconds, sessions }
  last: null,         // { unitId, difficulty }
  lastBy: {},         // Học tiếp theo môn, chỉ lưu trên máy.
});

let root = null;

function normalizeProfile(p) {
  const base = emptyProfile(p.id, p.track);
  return { ...base, ...p, lastBy: { ...(p.lastBy || {}) }, settings: { ...base.settings, ...(p.settings || {}) } };
}

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.profiles) {
      root = { active: raw.active, profiles: {}, queue: raw.queue || [] };
      for (const [id, p] of Object.entries(raw.profiles)) root.profiles[id] = normalizeProfile(p);
    } else {
      root = { active: null, profiles: {}, queue: [] };
      // Chuyển dữ liệu bản cũ (chỉ có một người học, lộ trình cấp 3) sang hồ sơ đầu tiên.
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      if (old?.settings?.name) {
        const p = normalizeProfile({ ...old, id: 'p-chi', track: 'thpt' });
        delete p.queue;
        root.profiles[p.id] = p;
        root.active = p.id;
        root.queue = (old.queue || []).map((q) => ({ ...q, profileId: p.id }));
        save();
      }
    }
  } catch {
    // Dữ liệu hỏng: cất bản gốc sang khoá dự phòng trước khi bắt đầu lại, để còn cứu được.
    try {
      const bad = localStorage.getItem(KEY);
      if (bad) localStorage.setItem(`${KEY}.backup-${Date.now()}`, bad);
    } catch { /* bỏ qua */ }
    root = { active: null, profiles: {}, queue: [] };
    setTimeout(() => window.dispatchEvent(new Event('tuhocta:recovered')));
  }
  if (root.active && !root.profiles[root.active]) root.active = null;
  return get();
}

// Hồ sơ đang học (null nếu chưa chọn).
export const get = () => {
  if (!root) load();
  return root.active ? root.profiles[root.active] : null;
};

export const profiles = () => { if (!root) load(); return Object.values(root.profiles); };
export const queue = () => root.queue;

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(root));
  } catch {
    window.dispatchEvent(new Event('tuhocta:save-failed')); // bộ nhớ đầy hoặc bị chặn
  }
}

export function createProfile({ name, track, palette }) {
  const id = `p-${Date.now().toString(36)}`;
  const p = emptyProfile(id, track);
  p.settings.name = name;
  if (palette) p.settings.palette = palette;
  if (track === 'tieuhoc') { p.settings.sessionSize = 8; p.settings.dailyGoal = 20; }
  root.profiles[id] = p;
  root.active = id;
  save();
  enqueue('profile', { id, name, track });
  // Gửi cả cài đặt ban đầu (bộ màu, số từ mỗi lượt…) để máy khác mở hồ sơ này thấy giống hệt.
  enqueue('settings', { ...p.settings });
  return p;
}

export function switchProfile(id) {
  if (!root.profiles[id]) return;
  root.active = id;
  save();
}

export function signOut() {
  root.active = null;
  save();
}

export function setSetting(key, value) {
  get().settings[key] = value;
  save();
  enqueue('settings', { [key]: value });
}

export function enqueue(type, payload, profileId = root.active) {
  // Máy đã chọn "chỉ lưu trên máy này" (vd các cháu họ hàng): không xếp hàng gửi đi, tránh đầy bộ nhớ.
  let localOnly = false;
  try { localOnly = localStorage.getItem('tuhocta.localOnly') === '1'; } catch { /* bỏ qua */ }
  if (!localOnly) root.queue.push({ type, profileId, payload, at: Date.now() });
  save();
  window.dispatchEvent(new Event('tuhocta:changed'));
}

// Đã gửi lên máy chủ thành công n mục đầu hàng đợi.
export function dropQueue(n) {
  root.queue.splice(0, n);
  save();
}

// Gộp dữ liệu kéo về từ Google Sheet (máy khác đã học) vào máy này.
export function mergeRemote({ profiles: rp = [], progress = {}, settings = {}, sessions = {} }) {
  const pendingSettings = new Set(root.queue.filter((q) => q.type === 'settings').map((q) => q.profileId));
  for (const r of rp) {
    if (!r.profileId || !r.track) continue;
    let p = root.profiles[r.profileId];
    if (!p) {
      p = normalizeProfile({ id: r.profileId, track: r.track, createdAt: Number(r.createdAt) || Date.now() });
      p.settings.name = r.name;
      root.profiles[p.id] = p;
    }
    // Gộp cap riêng: cấp cao không được mất khi một máy chưa kịp kéo dữ liệu mới.
    const localCap = p.settings.cap;
    const remoteCap = settings[p.id]?.cap;
    const hasCap = localCap != null || remoteCap != null;
    // Cài đặt: lấy bản trên máy chủ, trừ khi máy này còn thay đổi chưa gửi.
    if (settings[p.id] && !pendingSettings.has(p.id)) p.settings = { ...p.settings, ...settings[p.id] };
    if (hasCap) {
      const merged = mergeCap(localCap, remoteCap);
      p.settings.cap = merged;
      const mustSend = pendingSettings.has(p.id)
        ? !sameCap(merged, localCap)
        : !sameCap(merged, remoteCap);
      if (mustSend) enqueue('settings', { cap: merged }, p.id);
    }
    // Tiến độ từng từ: bản nào làm sau thì giữ.
    for (const [wid, v] of Object.entries(progress[p.id] || {})) {
      if (!p.progress[wid] || v.lastAt > p.progress[wid].lastAt) p.progress[wid] = v;
    }
    // Lượt học trên máy khác: thêm vào lịch sử và thống kê ngày (chuỗi 🔥, phút học).
    const have = new Set(p.sessions.map((s) => s.sessionId));
    for (const s of sessions[p.id] || []) {
      if (!s.sessionId || have.has(s.sessionId)) continue;
      p.sessions.push({ ...s, wrongIds: [], remote: true });
      const k = dayKey(new Date(s.endedAt));
      p.daily[k] ||= { words: 0, seconds: 0, sessions: 0 };
      p.daily[k].sessions += 1;
      p.daily[k].seconds += s.activeSeconds || 0;
      p.daily[k].words += s.total || 0;
    }
    p.sessions.sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
    if (p.sessions.length > 300) p.sessions.splice(0, p.sessions.length - 300);
  }
  save();
}

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today() {
  const s = get();
  const k = dayKey();
  s.daily[k] ||= { words: 0, seconds: 0, sessions: 0 };
  return s.daily[k];
}

// Chuỗi ngày học liên tục, tính đến hôm nay (hôm nay chưa học thì tính đến hôm qua).
// Một ngày "có học" khi đã làm ít nhất một từ, kể cả khi tắt app giữa lượt.
export function streak(profile = get()) {
  const daily = profile.daily;
  const studied = (d) => (daily[dayKey(d)]?.words || 0) > 0 || (daily[dayKey(d)]?.sessions || 0) > 0;
  const d = new Date();
  if (!studied(d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (studied(d)) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function recordSession(session, attempts) {
  const s = get();
  s.sessions.push(session);
  if (s.sessions.length > 300) s.sessions.splice(0, s.sessions.length - 300);
  const t = today();
  t.sessions += 1;
  t.seconds += session.activeSeconds;
  // Lượt "ôn từ đến hạn" không phải một Unit: giữ nguyên Unit để nút "Học tiếp" còn đúng.
  if (session.module === 'vocab-scramble' && session.unitId !== 'review') s.last = { unitId: session.unitId, difficulty: session.difficulty };
  save();
  enqueue('session', { ...session, attempts });
}

export function countWord() {
  today().words += 1;
  save();
}

export function recordFeedback(fb) {
  get().feedback.push(fb);
  save();
  enqueue('feedback', fb);
}

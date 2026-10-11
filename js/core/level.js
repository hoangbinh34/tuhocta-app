// Logic học theo cấp của Vật lý. File này không đụng DOM để dùng chung cho app và test.

import { isDue } from './srs.js';

export const DEFAULT_CFG = Object.freeze({
  WINDOW: 10,
  PASS: 8,
  RETRY_GAP_DAYS: 2,
  REVIEW_SHARE: 0.1,
  REVIEW_SHARE_LOW: 0.3,
  LOW: 3,
  PLACE_PER_LEVEL: 2,
});

const DAY = 24 * 60 * 60 * 1000;
const config = (cfg) => ({ ...DEFAULT_CFG, ...(cfg || {}) });
const copy = (x) => JSON.parse(JSON.stringify(x || {}));
const state = (cap, topic) => cap?.[topic] || { lv: 1, up: {}, h: {}, at: 0 };
const groupTogether = (items) => {
  const units = [];
  const groups = new Map();
  for (const item of items) {
    const id = item.group?.id;
    if (!id) units.push([item]);
    else if (groups.has(id)) groups.get(id).push(item);
    else { const unit = [item]; groups.set(id, unit); units.push(unit); }
  }
  return units.flat();
};
const byOldest = (progress) => (a, b) => (progress[a.id]?.lastAt || 0) - (progress[b.id]?.lastAt || 0) || a.id.localeCompare(b.id);
const add = (out, seen, item, size) => {
  if (out.length < size && item && !seen.has(item.id)) { out.push(item); seen.add(item.id); }
};

export function windowStat(cap, topic, cfg) {
  const c = config(cfg);
  const s = state(cap, topic);
  const h = s.h?.[s.lv] || [];
  return { lv: s.lv, right: h.filter((x) => x[1]).length, size: h.length, need: c.PASS };
}

export function canPlace(cap, topic) { return !cap?.[topic]; }

export function applyPlacement(cap, topic, lv, now) {
  if (!cap[topic]) cap[topic] = { lv: Math.min(3, Math.max(1, lv)), up: { [Math.min(3, Math.max(1, lv))]: now }, h: {}, place: now, at: now };
  return cap[topic];
}

// prevAt must be read before review() changes progress[item.id].lastAt.
export function recordAnswer(cap, topic, item, ok, now, prevAt = 0, cfg) {
  const c = config(cfg);
  if (!cap[topic]) cap[topic] = { lv: 1, up: { 1: now }, h: {}, at: now };
  const s = cap[topic];
  if (s.lv === 4) return { up: null };
  if (item.level !== s.lv || (prevAt > 0 && now - prevAt < c.RETRY_GAP_DAYS * DAY)) return { up: null };
  const h = (s.h[s.lv] || []).filter((x) => x[0] !== item.id);
  h.push([item.id, ok ? 1 : 0, now]);
  s.h[s.lv] = h.slice(-c.WINDOW);
  s.at = now;
  const stat = windowStat(cap, topic, c);
  if (stat.size < c.WINDOW || stat.right < c.PASS) return { up: null };
  s.lv += 1;
  s.up[s.lv] = now;
  s.at = now;
  return { up: s.lv };
}

export function isLow(cap, topic, cfg) {
  const c = config(cfg);
  const stat = windowStat(cap, topic, c);
  return stat.size === c.WINDOW && stat.right <= c.LOW;
}

export function pickSession(items, progress, cap, topic, now, rnd = Math.random, cfg) {
  const c = config(cfg);
  const s = state(cap, topic);
  const lv = s.lv;
  // Lượt vẫn 10 câu; cap=nho chỉ thu nhỏ cửa sổ xét lên cấp, không cắt ngân hàng lượt.
  const size = DEFAULT_CFG.WINDOW;
  const due = (it) => isDue(progress[it.id], now);
  if (lv === 4) {
    const all = items.filter(due);
    const wrong = all.filter((it) => { const p = progress[it.id]; return p.wrong > 0 && p.box === 1; });
    const rest = all.filter((it) => !wrong.includes(it)).sort((a, b) => (progress[a.id].box - progress[b.id].box) || byOldest(progress)(a, b));
    return groupTogether([...wrong.sort(byOldest(progress)), ...rest].slice(0, size));
  }
  const out = [], seen = new Set();
  const wrong = items.filter((it) => it.level <= lv && due(it) && progress[it.id].wrong > 0 && progress[it.id].box === 1).sort(byOldest(progress));
  wrong.slice(0, 3).forEach((it) => add(out, seen, it, size));
  const reviewLimit = Math.round(size * (isLow(cap, topic, c) ? c.REVIEW_SHARE_LOW : c.REVIEW_SHARE));
  items.filter((it) => it.level < lv && due(it) && !seen.has(it.id)).sort(byOldest(progress)).slice(0, reviewLimit).forEach((it) => add(out, seen, it, size));
  const current = items.filter((it) => it.level === lv && !seen.has(it.id));
  const fresh = current.filter((it) => !progress[it.id]).sort((a, b) => a.id.localeCompare(b.id));
  const eligible = current.filter((it) => progress[it.id] && now - (progress[it.id].lastAt || 0) >= c.RETRY_GAP_DAYS * DAY).sort((a, b) => (progress[a.id].box - progress[b.id].box) || byOldest(progress)(a, b));
  const early = current.filter((it) => progress[it.id] && now - (progress[it.id].lastAt || 0) < c.RETRY_GAP_DAYS * DAY).sort((a, b) => (progress[a.id].box - progress[b.id].box) || byOldest(progress)(a, b));
  for (const list of [fresh, eligible, early]) for (const it of list) add(out, seen, it, size);
  // rnd is intentionally accepted for a stable caller API; priority ordering above must remain explainable.
  void rnd;
  return groupTogether(out);
}

export function placementItems(items, progress, rnd = Math.random, cfg) {
  const c = config(cfg), out = [], seen = new Set();
  for (let lv = 1; lv <= 3; lv++) {
    const pool = items.filter((it) => it.level === lv);
    const fresh = pool.filter((it) => !progress[it.id]).sort((a, b) => a.id.localeCompare(b.id));
    const old = pool.filter((it) => progress[it.id]).sort(byOldest(progress));
    [...fresh, ...old].slice(0, c.PLACE_PER_LEVEL).forEach((it) => add(out, seen, it, Infinity));
  }
  void rnd;
  return groupTogether(out);
}

export function placementLevel(results, cfg) {
  const c = config(cfg);
  let level = 1;
  for (let lv = 1; lv <= 3; lv++) {
    const rs = results.filter((r) => r.level === lv);
    if (rs.length < c.PLACE_PER_LEVEL || rs.some((r) => !r.ok)) break;
    level = Math.min(3, lv + 1);
  }
  return level;
}

export function capUnitId(kind, topic) { return `vl-${kind === 'place' ? 'place' : 'cap'}-${topic}`; }
export function parseCapUnit(unitId) {
  const m = /^vl-(cap|place)-([a-z0-9-]+)$/.exec(String(unitId || ''));
  return m ? { kind: m[1], topic: m[2] } : null;
}

export function mergeCap(a, b) {
  if (!a) return copy(b);
  if (!b) return copy(a);
  const out = {};
  for (const topic of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[topic], y = b[topic];
    if (!x) { out[topic] = copy(y); continue; }
    if (!y) { out[topic] = copy(x); continue; }
    // Đồng lv/at: so nội dung h theo khoá đã sắp, giữ nguyên thứ tự ô.
    // Không ưu tiên local: hai máy phải chọn cùng cửa sổ để ngừng gửi lại.
    const winner = x.lv > y.lv ? x : x.lv < y.lv ? y
      : (x.at || 0) > (y.at || 0) ? x : (x.at || 0) < (y.at || 0) ? y
      : JSON.stringify(canonical(x.h || {})) >= JSON.stringify(canonical(y.h || {})) ? x : y;
    const up = { ...x.up };
    for (const [lv, at] of Object.entries(y.up || {})) up[lv] = up[lv] ? Math.min(up[lv], at) : at;
    out[topic] = { lv: Math.max(x.lv || 1, y.lv || 1), up, h: copy(winner.h), at: Math.max(x.at || 0, y.at || 0) };
    const places = [x.place, y.place].filter((v) => v != null);
    if (places.length) out[topic].place = Math.min(...places);
  }
  return out;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
export function sameCap(a, b) { return JSON.stringify(canonical(a || {})) === JSON.stringify(canonical(b || {})); }

export function capFlagCfg(loc) {
  const q = new URLSearchParams(loc?.search || '');
  return loc?.hostname === 'localhost' && q.get('thu') === 'vatly' && q.get('cap') === 'nho' ? { WINDOW: 3, PASS: 2 } : undefined;
}

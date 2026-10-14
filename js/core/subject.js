// Môn học trong một lộ trình (Tiếng Anh, Vật lý…): danh sách môn, môn đang mở, nhớ môn vừa học trên máy.
// Không DOM, test được bằng node (tools/test-subjects.mjs).
// Môn đang chọn lưu riêng từng máy (khoá tuhocta.subject.<profileId>), không nằm trong hồ sơ, không gửi lên.

import { parseCapUnit } from './level.js';

const KEY = (pid) => `tuhocta.subject.${pid}`;

// Danh sách môn của lộ trình. Lộ trình chưa có `subjects` (dữ liệu cũ) → một môn `anh` lấy đường dẫn ở cấp lộ trình.
export function subjectsOf(track) {
  if (!track) return [];
  if (Array.isArray(track.subjects) && track.subjects.length) return track.subjects;
  return [{ id: 'anh', title: 'Tiếng Anh', emoji: '🇬🇧', curriculum: track.curriculum, exercises: track.exercises }];
}

// Môn bấm vào được: mọi môn trừ môn khai `enabled: false` ("Sắp có").
// `thu` là tên môn (từ thuFlag) → chỉ mở môn khoá có bài tập trùng tên; `true` (cách gọi cũ) → mở mọi môn khoá có bài tập.
export const openSubjects = (subjects, { thu = false } = {}) => (subjects || []).filter((s) => s.enabled !== false || (thu && s.exercises && (thu === true || s.id === thu)));

export function loadSubject(pid) {
  try { return localStorage.getItem(KEY(pid)) || null; } catch { return null; }
}

export function saveSubject(pid, sid) {
  try { localStorage.setItem(KEY(pid), sid); } catch { /* máy hết chỗ: lần sau chọn lại */ }
}

export function clearSubject(pid) {
  try { localStorage.removeItem(KEY(pid)); } catch { /* bỏ qua */ }
}

// Cờ thử `?thu=chonmon`: hiện màn chọn môn kể cả khi chỉ 1 môn mở. Chỉ nhận khi chạy ở localhost.
export function forceFlag(loc) {
  return loc?.hostname === 'localhost' && new URLSearchParams(loc.search || '').get('thu') === 'chonmon';
}

// Cờ thử `?thu=<môn>`: mở môn còn khoá để thử. Trả tên môn hoặc null; chỉ nhận ở localhost (`chonmon` do forceFlag lo).
export function thuFlag(loc) {
  if (loc?.hostname !== 'localhost') return null;
  const thu = new URLSearchParams(loc.search || '').get('thu');
  return thu && thu !== 'chonmon' ? thu : null;
}

export const vatlyFlag = (loc) => thuFlag(loc) === 'vatly';

// Tiền tố id của Vật lý đã lưu trên máy chủ và máy con, không đổi được; môn mới tự lấy `<id>-` hoặc `idPrefix` trong tracks.json.
export const LEGACY_PREFIX = { vatly: 'vl-' };

// Đặc điểm của một môn, tính một nơi: tiền tố id đơn vị, module luyện theo cấp, module lý thuyết, các module "học" (không phải đề thi).
// `modules` là modulesOf(track, sid), `entry` là mục của môn trong tracks.json.
export function subjectTraits(sid, modules = [], entry) {
  const list = Array.isArray(modules) ? modules : [];
  const levelId = list.find((m) => m.level)?.id ?? null;
  const theoryId = list.find((m) => m.theory)?.id ?? null;
  return {
    sid,
    prefix: entry?.idPrefix ?? LEGACY_PREFIX[sid] ?? `${sid}-`,
    levelId,
    theoryId,
    learnIds: levelId ? list.filter((m) => m.route?.startsWith('#/ex') && !m.mock).map((m) => m.id) : [],
  };
}

// Vật lý đúng như trước khi có subjectTraits: nơi duy nhất ghi cứng, dùng khi hàm cũ được gọi không có traits.
export const VATLY_TRAITS = { sid: 'vatly', prefix: 'vl-', levelId: 'vl-chu-de', theoryId: 'vl-ly-thuyet', learnIds: ['vl-ly-thuyet', 'vl-chu-de'] };

export const levelHref = (traits, topic) => `#/ex-play?m=${traits.levelId}&set=cap&topic=${encodeURIComponent(topic)}`;

// Nhãn chữ theo tên môn (trang phụ huynh, nút Học tiếp); "Vật lý" ra đúng từng chữ cũ.
export const subjectLabels = (title) => ({
  right: `đúng ${title}`,
  cap: `Cấp ${title}`,
  mock: `Đề thi thử ${title}`,
  capMissing: `Cần cập nhật máy chủ để xem cấp ${title}`,
  mockMissing: `Cần cập nhật máy chủ để xem điểm đề ${title}`,
  mockNone: `Chưa có điểm đề ${title} trong khoảng này.`,
  continueSub: `${title} · Tiếp tục bài gần nhất`,
});

// Blocks that vary by subject; keeping this pure makes the home decision testable.
export function homeBlocks(subject, lastBy = {}, traits = VATLY_TRAITS) {
  const blocks = { vocab: subject === 'anh', modules: true };
  const last = lastBy?.[subject];
  if (traits.sid === subject && traits.levelId && last) {
    blocks.continue = last.set === 'cap'
      ? levelHref(traits, last.topic)
      : `#/ex-play?m=${encodeURIComponent(last.m)}&set=${encodeURIComponent(last.set)}`;
  }
  return blocks;
}

// Bài xếp cấp chỉ làm một lần: Học tiếp luôn mở luyện cấp cùng chủ đề.
export function lastByEntry(modId, setId, { isReview = false } = {}, now = Date.now(), traits = VATLY_TRAITS) {
  if (isReview || !traits.learnIds.includes(modId)) return null;
  const unit = parseCapUnit(setId, traits.prefix);
  if (unit) return { m: traits.levelId, set: 'cap', topic: unit.topic, at: now };
  return { m: modId, set: setId, at: now };
}

// Môn của một đơn vị: bỏ `review-`, khớp tiền tố dài nhất trong `subjects` (danh sách traits); không khớp → `anh`.
export function subjectOfUnit(id, subjects = [VATLY_TRAITS]) {
  const bare = String(id || '').replace(/^review-/, '');
  let best = null;
  for (const t of subjects) if (bare.startsWith(t.prefix) && (!best || t.prefix.length > best.prefix.length)) best = t;
  return best ? best.sid : 'anh';
}

// Khoá đầu ra: `anh` và các môn trong `sids` (mặc định chỉ Vật lý, như cũ).
export function splitBySubject(byUnit = {}, unitSubject, sids = [VATLY_TRAITS.sid]) {
  const out = { anh: { total: 0, correct: 0 }, ...Object.fromEntries(sids.map((sid) => [sid, { total: 0, correct: 0 }])) };
  for (const [id, row] of Object.entries(byUnit)) {
    const sid = unitSubject?.(id) || subjectOfUnit(id);
    const dest = out[sid] || out.anh;
    dest.total += Number(row?.total || 0);
    dest.correct += Number(row?.correct || 0);
  }
  return out;
}

export const topicRows = (topics = [], sets = []) => topics.map((topic) => {
  const mine = sets.filter((set) => set.topic === topic.id);
  return { ...topic, sets: mine, soon: mine.length === 0 };
});

// Vào màn nào: { screen: 'subjects' } hoặc { screen: 'home', sid }.
// - Lộ trình chỉ 1 môn mở → vào thẳng môn đó, không hỏi (kể cả khoá đã lưu trỏ môn khác).
// - ≥2 môn mở (hoặc cờ thử force) → môn đã lưu còn mở thì vào thẳng, chưa lưu/không còn mở thì hiện màn chọn môn.
export function subjectRoute({ subjects, saved, force = false, thu = false }) {
  const open = openSubjects(subjects, { thu });
  if (open.length < 2 && !force) return { screen: 'home', sid: open[0]?.id || 'anh' };
  if (saved && open.some((s) => s.id === saved)) return { screen: 'home', sid: saved };
  return { screen: 'subjects' };
}

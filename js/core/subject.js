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
export const openSubjects = (subjects, { thu = false } = {}) => (subjects || []).filter((s) => s.enabled !== false || (thu && s.id === 'vatly' && s.exercises));

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

export function vatlyFlag(loc) {
  return loc?.hostname === 'localhost' && new URLSearchParams(loc.search || '').get('thu') === 'vatly';
}

// Blocks that vary by subject; keeping this pure makes the home decision testable.
export function homeBlocks(subject, lastBy = {}) {
  const blocks = { vocab: subject === 'anh', modules: true };
  const last = lastBy?.vatly;
  if (subject === 'vatly' && last) {
    blocks.continue = last.set === 'cap'
      ? `#/ex-play?m=vl-chu-de&set=cap&topic=${encodeURIComponent(last.topic)}`
      : `#/ex-play?m=${encodeURIComponent(last.m)}&set=${encodeURIComponent(last.set)}`;
  }
  return blocks;
}

// Bài xếp cấp chỉ làm một lần: Học tiếp luôn mở luyện cấp cùng chủ đề.
export function lastByEntry(modId, setId, { isReview = false } = {}, now = Date.now()) {
  if (isReview || !['vl-ly-thuyet', 'vl-chu-de'].includes(modId)) return null;
  const unit = parseCapUnit(setId);
  if (unit) return { m: 'vl-chu-de', set: 'cap', topic: unit.topic, at: now };
  return { m: modId, set: setId, at: now };
}

export function splitBySubject(byUnit = {}, unitSubject) {
  const out = { anh: { total: 0, correct: 0 }, vatly: { total: 0, correct: 0 } };
  for (const [id, row] of Object.entries(byUnit)) {
    const sid = unitSubject?.(id) || (/^(review-)?vl-/.test(id) ? 'vatly' : 'anh');
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

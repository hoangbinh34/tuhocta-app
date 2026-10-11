// Đọc danh sách lộ trình, chương trình (curriculum) và bộ từ theo Unit.
// Đường dẫn tính từ vị trí file này để app chạy được cả ở localhost lẫn GitHub Pages (thư mục con).

import { flattenItems } from '../modules/exercise/check.js';
import { subjectsOf } from './subject.js';

const base = new URL('../../data/', import.meta.url);
let tracks = null;
let trackId = 'thpt';
let subjectId = 'anh';
const curricula = new Map();
const unitCache = new Map();

async function getJSON(path) {
  const res = await fetch(new URL(path, base), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Không tải được ${path} (${res.status})`);
  return res.json();
}

export async function getTracks() {
  if (!tracks) tracks = (await getJSON('tracks.json')).tracks;
  return tracks;
}

export async function getTrack(id = trackId) {
  return (await getTracks()).find((t) => t.id === id) || null;
}

// Lộ trình của hồ sơ đang học. main.js gọi trước mỗi lần chuyển màn hình.
export function setTrack(id) { trackId = id || 'thpt'; }
export const currentTrack = () => trackId;

// Môn đang học (Tiếng Anh, Vật lý…). main.js gọi cùng lúc với setTrack.
export function setSubject(id) { subjectId = id || 'anh'; }
export const currentSubject = () => subjectId;

// Danh sách môn của lộ trình (lộ trình chưa khai `subjects` → một môn `anh` lấy đường dẫn cấp lộ trình).
export async function getSubjects(tid = trackId) {
  return subjectsOf(await getTrack(tid));
}

export async function getSubject(tid = trackId, sid = subjectId) {
  return (await getSubjects(tid)).find((s) => s.id === sid) || null;
}

// Môn không có phần từ vựng (Vật lý) → chương trình rỗng, không ném lỗi.
export async function getCurriculum(tid = trackId, sid = subjectId) {
  const key = `${tid}:${sid}`;
  if (!curricula.has(key)) {
    const s = await getSubject(tid, sid);
    if (!s?.curriculum) return { grades: [] };
    const c = await getJSON(s.curriculum);
    const dir = s.curriculum.replace(/[^/]+$/, '');
    // Đường dẫn file từ trong curriculum là tương đối với thư mục của curriculum.
    for (const g of c.grades) for (const u of g.units) if (u.file) u.path = dir + u.file;
    curricula.set(key, c);
  }
  return curricula.get(key);
}

export async function allUnits(tid = trackId, sid = subjectId) {
  const c = await getCurriculum(tid, sid);
  return c.grades.flatMap((g) => g.units.map((u) => ({ ...u, grade: g.grade })));
}

export async function findUnit(id, tid = trackId, sid = subjectId) {
  return (await allUnits(tid, sid)).find((u) => u.id === id) || null;
}

export async function getUnitWords(unitId, tid = trackId, sid = subjectId) {
  const key = `${tid}:${sid}:${unitId}`;
  if (unitCache.has(key)) return unitCache.get(key);
  const unit = await findUnit(unitId, tid, sid);
  if (!unit?.path) return [];
  const words = (await getJSON(unit.path)).map((w) => ({ ...w, unitId }));
  unitCache.set(key, words);
  return words;
}

// tid, sid: lộ trình và môn cần đọc; mặc định là của hồ sơ đang học (trang phụ huynh đọc mọi lộ trình).
export async function getAllWords(tid = trackId, sid = subjectId) {
  const units = (await allUnits(tid, sid)).filter((u) => u.path);
  const lists = await Promise.all(units.map((u) => getUnitWords(u.id, tid, sid)));
  return lists.flat();
}

// ---------- bài tập (ngữ âm, ngữ pháp, đọc hiểu…) ----------
const exCache = new Map();
// Lưu lời hứa tải file; nếu lỗi thì xoá khỏi bộ nhớ đệm để lần sau tải lại.
const cached = (key, p) => p.catch((e) => { exCache.delete(key); throw e; });

async function exerciseModules(tid, sid) {
  const t = await getSubject(tid, sid);
  if (!t?.exercises) return { t: null, mods: null };
  const key = `${tid}:${sid}:mods`;
  if (!exCache.has(key)) exCache.set(key, cached(key, getJSON(t.exercises)));
  return { t, mods: await exCache.get(key) };
}

export const imgUrl = (exercisesPath, img) => img ? 'data/' + exercisesPath.replace(/[^/]+$/, '') + img : '';

export async function getModuleMeta(module, tid = trackId, sid = subjectId) {
  const { mods } = await exerciseModules(tid, sid);
  return mods?.modules?.find((m) => m.id === module) || null;
}

// Danh sách bài của một phần học, vd module 'grammar' → [{id, title, emoji, file, count}].
export async function getExerciseSets(module, tid = trackId, sid = subjectId) {
  const { t, mods } = await exerciseModules(tid, sid);
  if (!t || !mods) return [];
  const m = mods.modules.find((x) => x.id === module);
  if (!m) return [];
  const base = t.exercises.replace(/[^/]+$/, '');
  const idxKey = `${tid}:${sid}:idx:${module}`;
  if (!exCache.has(idxKey)) exCache.set(idxKey, cached(idxKey, getJSON(`${base}${m.dir}/_index.json`)));
  const list = await exCache.get(idxKey);
  return list.map((s) => ({ ...s, module, path: base + s.file }));
}

export async function getExerciseSet(module, setId, tid = trackId, sid = subjectId) {
  const s = (await getExerciseSets(module, tid, sid)).find((x) => x.id === setId);
  if (!s) return null;
  const key = `${tid}:${sid}:set:${setId}`;
  if (!exCache.has(key)) exCache.set(key, cached(key, getJSON(s.path)));
  return exCache.get(key);
}

// Mọi câu hỏi của một phần học (để ôn câu sai/đến hạn).
export async function getModuleItems(module, tid = trackId, sid = subjectId) {
  const sets = await getExerciseSets(module, tid, sid);
  // Một bài tải lỗi (mất mạng) không làm hỏng cả phần: bỏ qua bài đó, lần sau tải lại.
  const all = (await Promise.allSettled(sets.map((s) => getExerciseSet(module, s.id, tid, sid))))
    .filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  return all.flatMap((set) => flattenItems(set).map((it) => ({ instruction: set.instruction, ...it, setId: set.id, setTitle: set.title })));
}

// Câu ví dụ đầy đủ = câu có chỗ trống + từ. Chỗ trống đứng đầu câu thì viết hoa chữ đầu.
export function exampleParts(w) {
  const [before = '', after = ''] = (w.example || '').split('______');
  const atStart = before.trim() === '' || /[.!?]\s*$/.test(before);
  const filled = atStart ? w.word.charAt(0).toUpperCase() + w.word.slice(1) : w.word;
  return { before, filled, after };
}

export const fullExample = (w) => { const p = exampleParts(w); return p.before + p.filled + p.after; };

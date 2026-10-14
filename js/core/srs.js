// Ôn tập ngắt quãng theo hộp Leitner. Không đụng DOM để chạy test được bằng node.

export const DAY = 24 * 60 * 60 * 1000;
// Số ngày chờ trước lần ôn kế tiếp, theo hộp 0..5 (hộp 0 = từ mới).
export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16];
export const MASTERED_BOX = 3;

// start: gợi ý hiện sẵn · more: gợi ý mở thêm khi bấm 💡 (hết thì lộ dần chữ cái).
// Gợi ý: vi (nghĩa tiếng Việt), defEn (định nghĩa tiếng Anh), example (câu có chỗ trống),
// pic (hình emoji), audio (nghe từ).
const LEVELS = {
  easy:   { label: 'Dễ',  emoji: '😌', levels: [1, 2] },
  medium: { label: 'Vừa', emoji: '🙂', levels: [1, 2, 3] },
  hard:   { label: 'Khó', emoji: '🔥', levels: [2, 3] },
};

const BY_TRACK = {
  // Cấp 3: đề tốt nghiệp kiểm tra hiểu nghĩa trong ngữ cảnh, nên lên dần tới định nghĩa và câu.
  thpt: {
    easy:   { prefill: 1, decoys: 0, start: ['vi'],      more: ['defEn', 'example'] },
    medium: { prefill: 0, decoys: 0, start: ['defEn'],   more: ['vi', 'example'] },
    hard:   { prefill: 0, decoys: 2, start: ['example'], more: ['defEn', 'vi'] },
  },
  // Cấp 1: có hình và nghĩa tiếng Việt; nghe từ để luyện cả phát âm và chính tả.
  tieuhoc: {
    easy:   { prefill: 1, decoys: 0, start: ['pic', 'vi'], more: ['example', 'audio'] },
    medium: { prefill: 0, decoys: 0, start: ['vi'],        more: ['pic', 'example', 'audio'] },
    hard:   { prefill: 0, decoys: 2, start: ['example'],   more: ['pic', 'vi', 'audio'] },
  },
};

export const DIFFICULTY = LEVELS;

export const DIFF_DESC = {
  thpt: { easy: 'Gợi ý tiếng Việt, có sẵn chữ cái đầu', medium: 'Gợi ý bằng định nghĩa tiếng Anh', hard: 'Câu có chỗ trống + 2 chữ cái gây nhiễu' },
  tieuhoc: { easy: 'Có hình + nghĩa tiếng Việt, có sẵn chữ cái đầu', medium: 'Chỉ có nghĩa tiếng Việt', hard: 'Câu tiếng Anh có chỗ trống + 2 chữ cái gây nhiễu' },
};

export function diffFor(track, key) {
  const k = LEVELS[key] ? key : 'easy';
  return { key: k, ...LEVELS[k], ...(BY_TRACK[track] || BY_TRACK.thpt)[k] };
}

// Cập nhật trạng thái một từ sau một lần làm.
// correct: làm đúng ngay lần đầu, không xem đáp án. usedHint: có bấm gợi ý.
export function review(prev, { correct, usedHint }, now) {
  const p = prev ? { ...prev } : { box: 0, seen: 0, wrong: 0, dueAt: 0, lastAt: 0 };
  // Chỉ lên hộp khi từ đã đến hạn ôn: làm lại nhiều lần trong một ngày không có nghĩa là đã thuộc lâu.
  const due = p.box === 0 || p.dueAt <= now;
  p.seen += 1;
  p.lastAt = now;
  if (!correct) {
    p.wrong += 1;
    p.box = 1;
  } else if (usedHint) {
    p.box = Math.max(1, p.box); // đúng nhờ gợi ý: chưa tính là thuộc
    if (!due) return p;
  } else if (due) {
    p.box = Math.min(5, p.box + 1);
  } else {
    return p; // đúng nhưng chưa đến hạn: giữ hộp và ngày hẹn
  }
  p.dueAt = now + INTERVAL_DAYS[p.box] * DAY;
  return p;
}

export const isDue = (p, now) => !!p && p.box > 0 && p.dueAt <= now;

export function allowedPriorities(extended) {
  return extended ? [1, 2, 3] : [1, 2];
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Chọn từ cho một lượt: từ đến hạn ôn trước (tối đa maxDue), rồi từ mới hợp độ khó,
// thiếu thì bù bằng từ đã học ở hộp thấp nhất.
export function pickWords(words, progress, opts = {}) {
  const {
    size = 12,
    difficulty = 'medium',
    now = Date.now(),
    rand = Math.random,
    maxDue = Math.ceil(size / 2),
    extended = false,
  } = opts;
  const levels = DIFFICULTY[difficulty].levels;
  const prios = allowedPriorities(extended);
  const pool = words.filter((w) => prios.includes(w.priority ?? 2));
  const picked = [];
  const has = new Set();
  const add = (w) => { if (picked.length < size && !has.has(w.id)) { picked.push(w); has.add(w.id); } };

  const due = pool
    .filter((w) => isDue(progress[w.id], now))
    .sort((a, b) => progress[a.id].dueAt - progress[b.id].dueAt);
  due.slice(0, maxDue).forEach(add);

  const fresh = pool
    .filter((w) => !progress[w.id] && levels.includes(w.level))
    .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
  fresh.forEach(add);

  due.forEach(add);

  const rest = pool
    .filter((w) => progress[w.id])
    .sort((a, b) => progress[a.id].box - progress[b.id].box || progress[a.id].dueAt - progress[b.id].dueAt);
  rest.forEach(add);

  // Từ mới ở mức độ khó khác, khi chủ đề đã gần hết từ.
  pool.forEach(add);

  return shuffle(picked, rand);
}

export function unitStats(words, progress, now = Date.now(), extended = false) {
  const prios = allowedPriorities(extended);
  const pool = words.filter((w) => prios.includes(w.priority ?? 2));
  let mastered = 0, due = 0, seen = 0;
  for (const w of pool) {
    const p = progress[w.id];
    if (!p) continue;
    seen++;
    if (p.box >= MASTERED_BOX) mastered++;
    if (isDue(p, now)) due++;
  }
  return { total: pool.length, seen, mastered, due };
}

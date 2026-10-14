// Chấm đáp án và định dạng câu hỏi. Không đụng DOM để test được bằng node.

// Chuẩn hoá câu gõ: chữ thường, bỏ khoảng trắng thừa, thống nhất dấu nháy, bỏ dấu câu cuối.
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
    .replace(/[.!?;:,]+$/, '')
    .trim();
}

// Gõ đáp án: đúng nếu khớp một trong các đáp án chấp nhận.
// Câu viết lại có phần đầu (lead "Mai is ___"): con gõ lại cả câu ("Mai is shorter than Lan") cũng tính đúng.
export function checkInput(given, answers, lead) {
  const g = normalize(given);
  if (!g) return false;
  // Trên điện thoại hay gõ thiếu dấu nháy ("doesnt like"): so cả khi đã bỏ dấu nháy.
  const noQuote = (s) => s.replace(/'/g, '');
  const full = typeof lead === 'string' && lead.includes('___')
    ? answers.map((a) => lead.replace(/\[\[|\]\]/g, '').replace('___', a))
    : [];
  return [...answers, ...full].some((a) => normalize(a) === g || noQuote(normalize(a)) === noQuote(g));
}

// Trộn phương án trắc nghiệm, trả về thứ tự mới + vị trí đáp án mới.
export function shuffleOptions(options, answer, rand = Math.random) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), answer: order.indexOf(answer), order };
}

// Phương án không được trộn khi có "All of the above"/"Both A and B"… (đọc hiểu).
export const canShuffle = (options) => !options.some((o) => /\b(all|both|none|neither)\b.*\b(above|of them|a and b)\b/i.test(o));

const escHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// [[chữ]] → gạch chân; ___ → ô trống. Luôn escape trước để không chèn được HTML.
// Công thức (Vật lý): ^{…} → chỉ số trên, _{…} → chỉ số dưới, {{tử|mẫu}} → phân số (CSS lo phần vẽ).
export function rich(s) {
  return escHTML(s)
    .replace(/\[\[(.+?)\]\]/g, '<u>$1</u>')
    .replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>')
    .replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>')
    .replace(/\{\{(.+?)\|(.+?)\}\}/g, '<span class="frac"><span>$1</span><span>$2</span></span>')
    .replace(/_{3,}/g, '<span class="blank">___</span>');
}

// Bỏ ký hiệu định dạng, còn chữ thường (trang phụ huynh, câu đã trả lời).
export const plain = (s) => String(s ?? '')
  .replace(/\[\[|\]\]/g, '')
  .replace(/\^\{([^{}]*)\}/g, '^$1')
  .replace(/_\{([^{}]*)\}/g, '_$1')
  .replace(/\{\{(.+?)\|(.+?)\}\}/g, (_, a, b) => `${/[+\-−\s]/.test(a) ? `(${a})` : a}/${/[+\-−\s]/.test(b) ? `(${b})` : b}`);

// Sắp xếp: so thứ tự các mảnh con xếp với thứ tự đúng (hoặc một thứ tự khác cũng được chấp nhận).
export function checkOrder(given, parts, alts = []) {
  const g = given.map(normalize).join(' ');
  return [parts, ...alts].some((p) => p.map(normalize).join(' ') === g);
}

// Tìm lỗi sai: phải chọn đúng từ sai VÀ gõ đúng từ sửa.
export function checkError(pickedIndex, typed, wrongIndex, answers) {
  return pickedIndex === wrongIndex && checkInput(typed, answers);
}

export const wordCount = (s) => (String(s || '').trim().match(/[A-Za-z0-9'’-]+/g) || []).length;

// Trộn các mảnh sắp xếp sao cho khác thứ tự đúng (nếu có thể).
export function shuffleParts(parts, rand = Math.random) {
  if (parts.length < 2) return parts.map((p, i) => i);
  for (let tries = 0; tries < 20; tries++) {
    const order = parts.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (order.some((v, i) => v !== i)) return order;
  }
  return parts.map((_, i) => i).reverse();
}

// ---------- Vật lý: trả lời ngắn (num), đúng/sai 4 ý (tf4), điểm theo phần ----------

// Số ký tự tối đa của ô trả lời ngắn, gồm cả dấu "-" và ",". Theo phiếu trả lời trắc nghiệm của Bộ:
// mặc định 4, CHƯA xác minh bằng hình phiếu gốc (Công văn 1239/BGDĐT-QLCL); đổi ở đây nếu tìm được.
export const NUM_MAX_CHARS = 4;

// Làm tròn kiểu máy tính bỏ túi: nửa lên, đối xứng với số âm; cộng 1e-9 để 2,45 → 2,5 không hụt vì số nhị phân.
export function roundTo(x, d = 0) {
  const p = 10 ** d;
  return (Math.sign(x) * Math.round(Math.abs(x) * p + 1e-9)) / p || 0;
}

// Số viết kiểu phiếu: dấu phẩy thập phân, đủ d chữ số sau dấu phẩy (2.45 → "2,45"; 1.6 với d = 2 → "1,60").
export const fmtNum = (x, d = 0) => roundTo(x, d).toFixed(d).replace('.', ',');

// Đọc số con gõ: nhận phẩy hoặc chấm, bỏ số 0 thừa sau dấu phẩy. Sai dạng → null.
// Trả { value, text, dec }: text là dạng gọn ("2,450" → "2,45") để đếm ký tự, dec là số chữ số sau dấu phẩy.
export function parseNum(s) {
  const m = /^(-?)(\d+)(?:[.,](\d*))?$/.exec(String(s ?? '').replace(/\s+/g, ''));
  if (!m) return null;
  const frac = (m[3] || '').replace(/0+$/, '');
  const text = (m[1] && /[1-9]/.test(m[2] + frac) ? '-' : '') + m[2] + (frac ? ',' + frac : '');
  return { value: Number(text.replace(',', '.')), text, dec: frac.length };
}

// Đọc phân số a/b con gõ: a, b nguyên không dấu, b ≥ 1, bỏ 0 đầu và khoảng trắng quanh "/".
// Không nhận hỗn số ("1 1/2"), số âm, mẫu số 0. Trả { a, b, text } hoặc null.
export function parseFrac(s) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const a = BigInt(m[1]), b = BigInt(m[2]);
  if (b === 0n) return null;
  return { a, b, text: `${a}/${b}` };
}
const gcd = (x, y) => (y ? gcd(y, x % y) : x);

// Chấm đáp số phân số. opts.frac: 'toi-gian' (phải tối giản) | 'gia-tri' (bằng giá trị là đúng).
// So bằng nhân chéo trên số nguyên. why thêm: 'reduce' (đúng giá trị, chưa tối giản) | 'form' (không viết dạng phân số).
export function checkFrac(given, answer, opts = {}) {
  const maxChars = opts.maxChars ?? NUM_MAX_CHARS;
  if (!String(given ?? '').trim()) return { ok: false, why: 'empty' };
  const want = parseFrac(answer);
  if (!want) return { ok: false, why: 'wrong' };
  let g = null;
  if (String(given).includes('/')) {
    g = parseFrac(given);
    if (!g) return { ok: false, why: 'invalid' };
    if (g.text.length > maxChars) return { ok: false, why: 'long' };
  } else {
    const n = parseNum(given);
    if (!n) return { ok: false, why: 'invalid' };
    if (n.text.length > maxChars) return { ok: false, why: 'long' };
    if (!opts.decimal) return { ok: false, why: 'form' };
    // Số thập phân → phân số: chữ số bỏ dấu phẩy chia 10^(số chữ số sau phẩy).
    const digits = n.text.replace(/[-,]/g, '');
    if (n.text.startsWith('-')) return { ok: false, why: 'wrong' };
    const same = BigInt(digits) * want.b === want.a * 10n ** BigInt(n.dec);
    return { ok: same, why: same ? 'ok' : 'wrong' };
  }
  if (g.a * want.b !== want.a * g.b) return { ok: false, why: 'wrong' };
  if (opts.frac === 'toi-gian' && gcd(g.a, g.b) !== 1n) return { ok: false, why: 'reduce' };
  return { ok: true, why: 'ok' };
}

// Chấm câu trả lời ngắn. why: 'ok' | 'empty' | 'invalid' (chữ lạ) | 'long' (quá maxChars, mặc định NUM_MAX_CHARS)
// | 'round' (đúng giá trị nhưng làm tròn sai yêu cầu, vẫn tính sai) | 'wrong'.
// opts = { maxChars, frac, decimal } (tuỳ chọn): có opts.frac thì chấm phân số (checkFrac), answer là chuỗi "3/4".
export function checkNum(given, answer, round = 0, tolerance = 0, exact, opts) {
  if (opts?.frac) return checkFrac(given, answer, opts);
  if (!String(given ?? '').trim()) return { ok: false, why: 'empty' };
  const g = parseNum(given);
  if (!g) return { ok: false, why: 'invalid' };
  if (g.text.length > (opts?.maxChars ?? NUM_MAX_CHARS)) return { ok: false, why: 'long' };
  const target = roundTo(answer, round);
  if (Math.abs(g.value - target) <= (tolerance || 0) + 1e-9) return { ok: true, why: 'ok' };
  // Ghi thừa chữ số (chưa làm tròn) hoặc làm tròn ít chữ số hơn yêu cầu, mà giá trị vẫn khớp.
  const moreDigits = g.dec > round && roundTo(g.value, round) === target;
  const fewerDigits = g.dec < round && roundTo(exact ?? answer, g.dec) === g.value;
  return { ok: false, why: moreDigits || fewerDigits ? 'round' : 'wrong' };
}

// Đúng/sai 4 ý, điểm theo thang của Bộ (phần II): đúng 1 ý 0,1 · 2 ý 0,25 · 3 ý 0,5 · 4 ý 1 (phần của điểm tối đa câu).
export const TF4_SCALE = [0, 0.1, 0.25, 0.5, 1];
// given: mảng 4 ô true/false (ô chưa chọn: null). ok = đúng cả 4 ý (chỉ khi đó mới tính "đúng" cho lịch ôn).
export function checkTf4(given, answers) {
  const right = answers.filter((a, i) => Array.isArray(given) && given[i] === a).length;
  return { right, ok: right === answers.length, fraction: TF4_SCALE[right] ?? 0 };
}
// Câu trả lời đúng/sai dạng "Đ,S,S,Đ" (ô chưa chọn: "?").
export const tf4Text = (arr) => (arr || []).map((v) => (v === true ? 'Đ' : v === false ? 'S' : '?')).join(',');

// Điểm một câu. q.points = điểm tối đa của câu (flattenItems lấy từ sections[].points); không có thì mỗi câu 1 phần.
// a = câu trả lời: mcq số thứ tự, input chữ, error { picked, text }, num chữ, tf4 mảng 4 ô.
export function scoreItem(q, a) {
  if (q.type === 'writing' || q.type === 'card') return { points: 0, max: 0, ok: false };
  const max = q.points ?? 1;
  if (q.type === 'tf4') {
    const r = checkTf4(a, q.answers);
    return { points: r.fraction * max, max, ok: r.ok };
  }
  let ok = false;
  if (q.type === 'mcq') ok = a === q.answer;
  else if (q.type === 'input') ok = checkInput(a, q.answers, q.lead);
  else if (q.type === 'error') ok = checkError(a?.picked, a?.text, q.wrong, q.answers);
  else if (q.type === 'num') ok = checkNum(a, q.answer, q.round, q.tolerance, q.exact, { maxChars: q.maxChars, frac: q.frac, decimal: q.decimal }).ok;
  return { points: ok ? max : 0, max, ok };
}

// Điểm cả đề trên thang set.scale: (tổng điểm / tổng tối đa) × thang, làm tròn 2 chữ số.
// Đề không ghi points (Tiếng Anh): mỗi câu 1 phần, ra đúng công thức cũ của mock.js (số câu đúng / số câu × thang).
// Đề thật Vật lý có tổng tối đa = 10 = thang nên điểm là tổng điểm các câu.
export function scoreTest(set, answers) {
  let points = 0, max = 0;
  for (const q of flattenItems(set)) {
    const r = scoreItem(q, answers[q.id]);
    points += r.points;
    max += r.max;
  }
  const score = max ? Math.round((points / max) * set.scale * 100) / 100 : 0;
  return { score, points: Math.round(points * 100) / 100, max: Math.round(max * 100) / 100 };
}

// Báo cáo đề: chỉ gom các nhóm thực sự có câu, không phụ thuộc DOM hay danh sách topic cố định.
export function mockReport(test, answers) {
  const topics = new Map();
  const parts = (test.sections || []).map((sec) => {
    let points = 0, max = 0;
    for (const q of flattenItems({ sections: [sec] })) {
      const r = scoreItem(q, answers[q.id]);
      points += r.points; max += r.max;
      if (q.topic && r.max > 0) {
        const group = topics.get(q.topic) || { topic: q.topic, points: 0, max: 0 };
        group.points += r.points; group.max += r.max;
        topics.set(q.topic, group);
      }
    }
    return { name: sec.title, points, max };
  });
  // Chuẩn hoá tổng nhóm sang số nguyên đơn vị 0,01 trước khi so ngưỡng và xếp tỉ lệ.
  const topicScores = [...topics.values()].map((t) => ({ ...t, points: Math.round(t.points * 100), max: Math.round(t.max * 100) }));
  const weak = topicScores.filter((t) => t.points * 5 < t.max * 3)
    .sort((a, b) => a.points * b.max - b.points * a.max).slice(0, 2).map((t) => t.topic);
  const rounded = (r) => ({ ...r, points: Math.round(r.points * 100) / 100, max: Math.round(r.max * 100) / 100 });
  return { total: scoreTest(test, answers).score, parts: parts.map(rounded), topics: topicScores.map((t) => ({ ...t, points: t.points / 100, max: t.max / 100 })), weak };
}

// Đáp án đúng của một câu, dạng chữ (để hiện ở màn kết quả, trang phụ huynh).
export function answerText(it) {
  if (it.type === 'mcq') return plain(it.options[it.answer]);
  if (it.type === 'num' && it.frac) return String(it.answer) + (it.unit ? ' ' + plain(it.unit) : '');
  if (it.type === 'num') return fmtNum(it.answer, it.round) + (it.unit ? ' ' + plain(it.unit) : '');
  if (it.type === 'tf4') return tf4Text(it.answers);
  if (it.type === 'input') return (it.answers || [])[0] || '';
  if (it.type === 'order') return it.parts.map(plain).join((it.joiner || ' ') === ' ' ? ' ' : ' / ') + (it.end || '');
  if (it.type === 'error') return `${it.tokens[it.wrong]} → ${it.answers[0]}`;
  if (it.type === 'writing') return '(bài viết tự chấm, xem bài mẫu)';
  return '';
}

// Câu hỏi dạng chữ ngắn gọn (sắp xếp/tìm lỗi/viết không có prompt riêng).
export function questionText(it) {
  if (it.type === 'error') return it.tokens.join(' ');
  if (it.type === 'order') return (it.prompt ? it.prompt + ': ' : '') + it.parts.map(plain).join(' / ');
  return plain(it.prompt || '');
}

// Bài tập dạng nhóm (đoạn văn + nhiều câu hỏi) → danh sách câu đơn, mỗi câu mang theo đoạn văn.
export function flattenItems(set) {
  const out = [];
  // Đề thi thử chia theo phần (sections); mỗi phần có hướng dẫn riêng.
  // Phần có điểm riêng (sections[].points, đề Vật lý) thì mỗi câu mang theo points; đề Tiếng Anh không có, giữ nguyên.
  const src = set.sections
    ? set.sections.flatMap((sec) => sec.items.map((it) => ({ instruction: sec.instruction, ...it, section: sec.title, ...(it.points == null && sec.points != null && { points: sec.points }) })))
    : set.items;
  for (const it of src) {
    if (it.type === 'group') {
      // A question's points override its group; a group's points override its section.
      for (const sub of it.items) out.push({ ...sub, section: it.section, ...(sub.points == null && it.points != null && { points: it.points }), group: { id: it.id, title: it.title, passage: it.passage, instruction: it.instruction } });
    } else out.push(it);
  }
  return out;
}

// Keep cards at the front in file order; group members remain adjacent.
export function orderQueue(items, doShuffle, rnd = Math.random) {
  const cards = items.filter((it) => it.type === 'card');
  const units = [];
  const byGroup = new Map();
  for (const it of items.filter((x) => x.type !== 'card')) {
    if (it.group) {
      if (!byGroup.has(it.group.id)) { const unit = []; byGroup.set(it.group.id, unit); units.push(unit); }
      byGroup.get(it.group.id).push(it);
    } else units.push([it]);
  }
  if (doShuffle) for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
  return cards.concat(units.flat());
}

// Numeric keypad input, constrained to the answer-sheet character set.
// q (tuỳ chọn): câu num; có q.frac thì thêm "/", bỏ "-", chỉ cho "," khi q.decimal. Độ dài tối đa q.maxChars ?? NUM_MAX_CHARS.
export function numKey(text, key, q) {
  const value = String(text ?? '');
  if (key === '⌫') return value.slice(0, -1);
  if (!(q?.frac ? /^[0-9,/]$/ : /^[0-9,-]$/).test(key) || value.length >= (q?.maxChars ?? NUM_MAX_CHARS)) return value;
  if (key === '-' && value) return value;
  if (key === '/' && (!/\d/.test(value) || value.includes('/') || value.includes(','))) return value;
  if (key === ',' && (q?.frac && (!q.decimal || value.includes('/')) || !value || value === '-' || value.includes(','))) return value;
  return value + key;
}

// Các phím của bàn phím số (play.js và mock.js dùng chung). Không frac: 13 phím như cũ.
// Có frac: thêm "/", bỏ "-", bỏ "," trừ khi decimal.
export function numPadKeys(q) {
  if (!q?.frac) return ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '-', '⌫'];
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9', ...(q.decimal ? [','] : []), '0', '/', '⌫'];
}

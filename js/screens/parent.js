// Trang phụ huynh: bố đăng nhập bằng mật khẩu riêng, chỉ xem tiến độ và ý kiến của các con.
import { call, hasServer, login, token, setToken } from '../core/api.js';
import { getTracks, getSubjects, getAllWords, allUnits, getModuleItems, getExerciseSets, getModuleMeta } from '../core/data.js';
import { capFlagCfg, windowStat, capUnitId } from '../core/level.js';
import { modulesOf } from '../modules/_registry.js';
import { openSubjects, splitBySubject, vatlyFlag } from '../core/subject.js';
import { plain, questionText } from '../modules/exercise/check.js';
import { esc, go, toast } from '../ui/dom.js';

const RATING = { easy: '😌 Dễ', ok: '🙂 Vừa', hard: '😵 Khó' };
const NEXT = { same: 'muốn làm tiếp dạng này', change: 'muốn đổi chủ đề', home: '' };

function shell(inner) {
  return `
    <section class="screen parent">
      <header class="topbar">
        <a class="icon-btn" href="#/profiles" aria-label="Quay lại">←</a>
        <h1 class="title-md">👨‍👩‍👧 Phụ huynh</h1>
        <span class="icon-btn ghost"></span>
      </header>
      ${inner}
    </section>`;
}

export async function mount(el, params, { isCurrent = () => true } = {}) {
  if (!hasServer()) {
    el.innerHTML = shell(`<div class="card"><p>Trang phụ huynh cần kết nối Google Drive trước.</p>
      <p class="muted small">Làm theo <b>docs/huong-dan-cai-dat.md</b> (khoảng 10 phút), rồi gửi địa chỉ ứng dụng web cho Claude để gắn vào app.</p></div>`);
    return;
  }
  if (!token('parent')) return loginForm(el);

  const days = Number(params.days) || 7;
  el.innerHTML = shell('<p class="muted center">Đang tải số liệu…</p>');
  let data;
  try {
    data = await call('parentSummary', { token: token('parent'), from: Date.now() - days * 864e5, to: Date.now() });
  } catch (e) {
    if (!isCurrent()) return;
    if (!token('parent')) return loginForm(el);
    el.innerHTML = shell(`<div class="card">Chưa tải được số liệu (${esc(e.message)}). Kiểm tra mạng rồi thử lại.</div>`);
    return;
  }
  if (!isCurrent()) return;

  // Chỉ nạp Vật lý khi đã mở hoặc đang thử ở localhost; môn khoá phải giữ nguyên luồng cũ.
  const tracks = await getTracks();
  const thu = vatlyFlag(location);
  const cfg = capFlagCfg(location);
  const topicsByTrack = new Map();
  const wordById = new Map();
  const unitById = new Map();
  for (const t of tracks) for (const s of openSubjects(await getSubjects(t.id), { thu })) {
    (await getAllWords(t.id, s.id)).forEach((w) => wordById.set(w.id, w));
    (await allUnits(t.id, s.id)).forEach((u) => unitById.set(u.id, u));
    // Bài tập: tên bài và nội dung câu hỏi, để bảng thống kê đọc được.
    for (const m of modulesOf(t.id, s.id).filter((x) => x.route?.startsWith('#/ex'))) {
      if (s.id === 'vatly' && m.id === 'vl-chu-de') {
        const topics = (await getModuleMeta(m.id, t.id, s.id))?.topics || [];
        topicsByTrack.set(t.id, topics);
        for (const topic of topics) for (const kind of ['cap', 'place']) {
          unitById.set(capUnitId(kind, topic.id), { emoji: kind === 'cap' ? '🧪' : '🎯', title: `${kind === 'cap' ? 'Luyện cấp' : 'Xếp cấp'}: ${topic.title}`, ex: true });
        }
      }
      (await getExerciseSets(m.id, t.id, s.id)).forEach((st) => unitById.set(st.id, { emoji: st.emoji, title: `${m.title}: ${st.title}`, ex: true }));
      unitById.set(`review-${m.id}`, { emoji: '🔁', title: `${m.title}: ôn câu sai`, ex: true });
      (await getModuleItems(m.id, t.id, s.id)).forEach((it) => {
        // Câu ngữ âm có chung một đề bài, nên hiện 4 từ để phân biệt.
        const base = m.id === 'phonics' ? it.options.map(plain).join(' / ') : questionText(it);
        const text = it.group ? `${it.group.title || it.setTitle}: ${base}` : base;
        wordById.set(it.id, { word: text.length > 60 ? text.slice(0, 60) + '…' : text });
      });
    }
  }
  if (!isCurrent()) return;

  const fmtDay = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const dayList = Array.from({ length: Math.min(days, 14) }, (_, i) => {
    const d = new Date(Date.now() - (Math.min(days, 14) - 1 - i) * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const kids = data.profiles.map((p) => {
    const track = tracks.find((t) => t.id === p.track);
    const physicsOpen = track?.id === 'thpt' && openSubjects(track.subjects, { thu }).some((s) => s.id === 'vatly');
    const split = physicsOpen ? splitBySubject(p.byUnit) : null;
    const acc = p.words ? Math.round((p.correct / p.words) * 100) : 0;
    const englishAcc = split?.anh.total ? Math.round((split.anh.correct / split.anh.total) * 100) : 0;
    const physicsAcc = split?.vatly.total ? Math.round((split.vatly.correct / split.vatly.total) * 100) : 0;
    const maxMin = Math.max(10, ...dayList.map((d) => p.byDay[d]?.minutes || 0));
    const units = Object.entries(p.byUnit)
      .filter(([id]) => physicsOpen || !id.startsWith('vl-') && !id.startsWith('review-vl-'))
      .map(([id, u]) => ({ id, ...u, unit: unitById.get(id) }))
      .sort((a, b) => b.total - a.total);
    const capTable = !physicsOpen ? '' : !Object.hasOwn(p, 'cap')
      ? '<p class="muted small cap-missing">Cần cập nhật máy chủ để xem cấp Vật lý</p>'
      : `<h3 class="section-title">Cấp Vật lý</h3><div class="cap-table-wrap"><table class="cap-table"><thead><tr><th>Chủ đề</th><th>Cấp hiện tại</th><th>Ngày lên từng cấp</th><th>Cửa sổ hiện tại</th></tr></thead><tbody>${(topicsByTrack.get(p.track) || []).map((topic) => {
        const stat = windowStat(p.cap, topic.id, cfg);
        const state = p.cap?.[topic.id];
        const dates = Object.entries(state?.up || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([lv, at]) => `${Number(lv) === 4 ? '🏅' : `Cấp ${lv}`}: ${new Date(at).toLocaleDateString('vi-VN')}`).join(' · ');
        return `<tr><td>${esc(topic.emoji || '')} ${esc(topic.title)}</td><td>${stat.lv === 4 ? '🏅 Đã làm chủ' : `Cấp ${stat.lv}/3 · ${['', 'Biết', 'Hiểu', 'Vận dụng'][stat.lv]}`}</td><td>${esc(dates || 'Chưa bắt đầu')}</td><td>${stat.lv === 4 ? '—' : `${stat.size}/${cfg?.WINDOW || 10} câu · đúng ${stat.right}/${stat.size} (${stat.size ? Math.round(stat.right / stat.size * 100) : 0}%) · cần ${stat.need}`}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    return `
      <div class="card kid">
        <div class="kid-head"><span class="avatar">${esc((p.name || '?').charAt(0).toUpperCase())}</span>
          <div><b>${esc(p.name)}</b><div class="muted small">${track ? `${track.emoji} ${esc(track.title)}` : ''}</div></div></div>
        <div class="kpis">
          <div><b>${p.days}</b><span>ngày học</span></div>
          <div><b>${p.minutes}'</b><span>phút học</span></div>
          <div><b>${p.words}</b><span>lượt từ & câu</span></div>
          <div><b>${physicsOpen ? englishAcc : acc}%</b><span>${physicsOpen ? 'đúng Tiếng Anh' : 'đúng lần đầu'}</span></div>
          ${physicsOpen ? `<div><b>${physicsAcc}%</b><span>đúng Vật lý</span></div>` : ''}
        </div>
        <div class="muted small">Từ vựng: đã thuộc ${p.mastered} / ${p.learned} từ đã gặp${physicsOpen ? ` · Bài tập Tiếng Anh: ${split.anh.correct}/${split.anh.total} đúng · Vật lý: ${split.vatly.correct}/${split.vatly.total} đúng` : p.exDone != null ? ` · Bài tập: nắm chắc ${p.exMastered} / ${p.exDone} câu đã làm` : ''}</div>
        ${capTable}
        <div class="bars" aria-label="Phút học mỗi ngày">
          ${dayList.map((d) => {
            const m = Math.round(p.byDay[d]?.minutes || 0);
            return `<div class="bar-col" title="${fmtDay(d)}: ${m} phút"><div class="bar-v" style="height:${(m / maxMin) * 100}%"></div><span>${fmtDay(d).slice(0, 2)}</span></div>`;
          }).join('')}
        </div>
        ${units.length ? `<h3 class="section-title">Theo chủ đề</h3><ul class="plain">
          ${units.map((u) => `<li>${u.unit ? (u.unit.ex ? `${u.unit.emoji} ${esc(u.unit.title)}` : `${u.unit.emoji} Unit ${u.unit.no}: ${esc(u.unit.title)}`) : (u.id === 'review' ? '🔁 Ôn từ đến hạn' : esc(u.id))}
            <span class="muted">· ${u.total} ${u.unit?.ex ? "câu" : "từ"} · đúng ${u.total ? Math.round((u.correct / u.total) * 100) : 0}%</span></li>`).join('')}</ul>` : ''}
        ${p.topWrong.length ? `<h3 class="section-title">Từ hay sai</h3><div class="family">
          ${p.topWrong.filter((x) => !x.wordId.startsWith('vl-')).map((x) => { const w = wordById.get(x.wordId); return `<span class="chip warn">${esc(w ? w.word : x.wordId)} ×${x.count}</span>`; }).join('')}</div>` : ''}
        ${(p.writings || []).length ? `<h3 class="section-title">Bài viết của con</h3><ul class="plain feedback-list">${p.writings.map((w) => `<li><span class="muted small">${new Date(w.at).toLocaleDateString('vi-VN')}${wordById.get(w.itemId) ? ' · ' + esc(wordById.get(w.itemId).word) : ''}</span><div>“${esc(w.text)}”</div></li>`).join('')}</ul>` : ''}
        <h3 class="section-title">Ý kiến của con</h3>
        ${p.feedback.length ? `<ul class="plain feedback-list">${p.feedback.map((f) => {
          const u = unitById.get(f.unitId);
          return `<li><span class="muted small">${new Date(f.at).toLocaleDateString('vi-VN')} · ${u ? (u.ex ? esc(u.title) : `Unit ${u.no}`) : ''}</span>
            ${f.rating ? `<b>${RATING[f.rating] || esc(f.rating)}</b>` : ''} ${NEXT[f.next] ? `<span class="muted">(${NEXT[f.next]})</span>` : ''}
            ${f.note ? `<div>“${esc(f.note)}”</div>` : ''}</li>`;
        }).join('')}</ul>` : '<p class="muted small">Chưa có ý kiến trong khoảng này.</p>'}
      </div>`;
  }).join('');

  el.innerHTML = shell(`
    <div class="seg" role="tablist">
      ${[7, 30].map((d) => `<a class="seg-btn ${d === days ? 'active' : ''}" href="#/parent?days=${d}">${d} ngày</a>`).join('')}
    </div>
    ${kids || '<div class="card">Chưa có dữ liệu học nào được đồng bộ.</div>'}
    <button class="link center" id="logout">Đăng xuất phụ huynh</button>`);
  el.querySelector('#logout').addEventListener('click', () => { setToken('parent', null); go('#/profiles'); });
}

function loginForm(el) {
  el.innerHTML = shell(`
    <div class="card">
      <p>Nhập mật khẩu phụ huynh để xem tiến độ của các con.</p>
      <label class="field"><span>Mật khẩu phụ huynh</span><input id="pw" type="password" autocomplete="current-password"></label>
      <button class="btn btn-primary btn-lg" id="go">Xem tiến độ</button>
    </div>`);
  const pw = el.querySelector('#pw');
  const submit = async () => {
    try {
      await login('parent', pw.value);
      go(`#/parent?t=${Date.now()}`);
    } catch (e) {
      toast(e.code === 'wrong_secret' ? 'Mật khẩu chưa đúng' : 'Chưa kết nối được máy chủ');
    }
  };
  el.querySelector('#go').addEventListener('click', submit);
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

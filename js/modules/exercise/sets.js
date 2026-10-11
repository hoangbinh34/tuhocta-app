// Danh sách bài của một phần học (Ngữ âm, Ngữ pháp…), kèm tiến độ và nút ôn câu sai.
import * as store from '../../core/store.js';
import { getExerciseSets, getModuleItems, currentSubject, getModuleMeta } from '../../core/data.js';
import { isDue, MASTERED_BOX } from '../../core/srs.js';
import { findModule } from '../_registry.js';
import { topicRows } from '../../core/subject.js';
import { capFlagCfg, windowStat, canPlace, isLow, pickSession } from '../../core/level.js';
import { esc, go, ring } from '../../ui/dom.js';

export async function mount(el, params, { isCurrent = () => true } = {}) {
  const st = store.get();
  const mod = findModule(st.track, params.m, currentSubject());
  if (!mod?.enabled) { go('#/home'); return; }
  const sets = await getExerciseSets(mod.id);
  const items = await getModuleItems(mod.id);
  const meta = await getModuleMeta(mod.id);
  if (!isCurrent()) return;
  const now = Date.now();
  const cfg = capFlagCfg(location);
  const cap = mod.id === 'vl-chu-de' ? st.settings.cap || {} : {};
  const levels = ['', 'Biết', 'Hiểu', 'Vận dụng'];
  const due = items.filter((it) => isDue(st.progress[it.id], now)).length;

  const statOf = (setId) => {
    const its = items.filter((it) => it.setId === setId);
    const questions = its.filter((it) => it.type !== 'card');
    const done = questions.filter((it) => st.progress[it.id]).length;
    const good = questions.filter((it) => (st.progress[it.id]?.box || 0) >= MASTERED_BOX).length;
    return { total: questions.length, done, good };
  };

  const setButton = (s, i) => {
    const t = statOf(s.id);
    return `<button class="set" data-set="${esc(s.id)}">
      <span class="set-emoji">${esc(s.emoji)}</span>
      <span class="set-text"><span class="muted small">Bài ${i + 1}</span><b>${esc(s.title)}</b>
        <span class="muted small">${t.total ? (t.done ? `Đã làm ${t.done}/${t.total} câu · thuộc ${t.good}` : `${t.total} câu`) : '📖 Thẻ lý thuyết'}</span></span>
      ${t.total ? ring(t.good / t.total, '', 34) : ''}
    </button>`;
  };
  const progressOf = (row) => {
    const topic = row.id;
    const stat = windowStat(cap, topic, cfg);
    const history = cap[topic]?.h?.[stat.lv] || [];
    const bank = items.filter((it) => row.sets.some((s) => s.id === it.setId) && it.type !== 'card');
    const mastered = stat.lv === 4;
    const hasReview = !mastered || pickSession(bank, st.progress, cap, topic, now, undefined, cfg).length > 0;
    return `<div class="cap-progress" data-topic="${esc(topic)}">
      <p>${mastered ? `🏅 Đã làm chủ${cap[topic]?.up?.[4] ? ` · ${new Date(cap[topic].up[4]).toLocaleDateString('vi-VN')}` : ''}${hasReview ? '' : ' · chưa có câu cần ôn'}` : `Cấp ${stat.lv}/3 · ${levels[stat.lv]}`}</p>
      ${mastered ? '' : `<div class="cap-window" aria-label="Cửa sổ cấp ${stat.lv}">${Array.from({ length: cfg?.WINDOW || 10 }, (_, i) => `<span class="cap-cell ${history[i] ? (history[i][1] ? 'right' : 'wrong') : ''}" aria-label="${history[i] ? (history[i][1] ? 'Đúng' : 'Sai') : 'Trống'}"></span>`).join('')}</div><p class="muted small">đúng ${stat.right}/${cfg?.WINDOW || 10}, cần ${stat.need}${cap[topic]?.up?.[stat.lv] ? ` · Bắt đầu ${new Date(cap[topic].up[stat.lv]).toLocaleDateString('vi-VN')}` : ''}</p>`}
      <div class="row">${hasReview ? `<button class="btn btn-primary" data-cap="cap" data-topic="${esc(topic)}">${mastered ? 'Ôn chủ đề' : `Luyện cấp ${stat.lv}`}</button>` : ''}${canPlace(cap, topic) ? `<button class="btn btn-soft" data-cap="place" data-topic="${esc(topic)}">Làm bài xếp cấp</button>` : ''}</div>
      ${!mastered && isLow(cap, topic, cfg) ? '<p class="muted small">Gợi ý: đọc lại thẻ lý thuyết</p><a class="btn btn-soft" href="#/ex?m=vl-ly-thuyet">Đọc thẻ lý thuyết</a>' : ''}
    </div>`;
  };
  const list = meta?.topics ? topicRows(meta.topics, sets).map((row) => `<section class="topic-row"><h2 class="section-title">${esc(row.emoji || '')} ${esc(row.title)}</h2>${row.soon ? '<p class="muted small">🔒 Sắp có</p>' : `${mod.id === 'vl-chu-de' ? progressOf(row) : ''}${row.sets.map((s) => setButton(s, sets.indexOf(s))).join('')}`}</section>`).join('')
    : !sets.length ? '<div class="card center">🔒 Sắp có: phần này đang soạn</div>'
      : sets.map(setButton).join('');

  el.innerHTML = `
    <section class="screen ex-sets">
      <header class="topbar">
        <a class="icon-btn" href="#/home" aria-label="Về trang chủ">←</a>
        <h1 class="title-md">${mod.emoji} ${esc(mod.title)}</h1>
        <span class="icon-btn ghost"></span>
      </header>
      ${sets.length ? `<button class="card card-review ${due ? '' : 'is-empty'}" id="review" ${due ? '' : 'disabled'}>
        <span>🔁</span><span>${due ? `Ôn <b>${due}</b> câu làm sai / đến hạn` : 'Chưa có câu nào cần ôn ✨'}</span>
      </button>` : ''}
      <div class="set-list">
        ${list}
      </div>
    </section>`;

  el.querySelector('#review')?.addEventListener('click', () => go(`#/ex-play?m=${mod.id}&set=review`));
  el.querySelector('.set-list').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cap]');
    if (c) { go(`#/ex-play?m=${mod.id}&set=${c.dataset.cap}&topic=${encodeURIComponent(c.dataset.topic)}&r=${Date.now()}`); return; }
    const b = e.target.closest('[data-set]');
    if (b) go(mod.mock ? `#/mock?m=${mod.id}&set=${b.dataset.set}&r=${Date.now()}` : `#/ex-play?m=${mod.id}&set=${b.dataset.set}&r=${Date.now()}`);
  });
}

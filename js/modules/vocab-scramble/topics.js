import * as store from '../../core/store.js';
import { getCurriculum, getUnitWords } from '../../core/data.js';
import { DIFFICULTY, DIFF_DESC, unitStats } from '../../core/srs.js';
import { esc, go, ring, sheet, $$ } from '../../ui/dom.js';

let currentGrade = 12;

export async function mount(el) {
  const st = store.get();
  const cur = await getCurriculum();
  if (!cur.grades.some((g) => g.grade === currentGrade)) currentGrade = cur.grades[0].grade;
  const stats = {};
  for (const g of cur.grades) {
    for (const u of g.units) {
      if (!u.path) continue;
      stats[u.id] = unitStats(await getUnitWords(u.id), st.progress, Date.now(), st.settings.extended);
    }
  }

  el.innerHTML = `
    <section class="screen topics">
      <header class="topbar">
        <a class="icon-btn" href="#/home" aria-label="Về trang chủ">←</a>
        <h1 class="title-md">Chọn chủ đề</h1>
        <span class="icon-btn ghost"></span>
      </header>
      <div class="tabs" role="tablist">
        ${cur.grades.length > 1 ? cur.grades.map((g) => `<button role="tab" class="tab" data-grade="${g.grade}">Lớp ${g.grade}</button>`).join('') : `<span class="tab active">Lớp ${cur.grades[0].grade} · ${esc(cur.book)}</span>`}
      </div>
      <label class="search">
        <span aria-hidden="true">🔍</span>
        <input id="q" type="search" placeholder="Tìm chủ đề… (vd: môi trường, AI, work)" autocomplete="off">
      </label>
      <div class="unit-grid" id="grid"></div>
    </section>`;

  const grid = el.querySelector('#grid');
  const q = el.querySelector('#q');

  function render() {
    const term = q.value.trim().toLowerCase();
    // Có từ khoá thì tìm ở mọi lớp; không thì chỉ hiện lớp đang chọn.
    const units = cur.grades.flatMap((g) => g.units.map((u) => ({ ...u, grade: g.grade })))
      .filter((u) => term ? `${u.title} ${u.titleVi}`.toLowerCase().includes(term) : u.grade === currentGrade);
    $$('.tab[data-grade]', el).forEach((t) => t.classList.toggle('active', !term && +t.dataset.grade === currentGrade));
    grid.innerHTML = units.length ? units.map((u) => {
      const s = stats[u.id];
      const ready = !!u.path;
      return `
        <button class="unit ${ready ? '' : 'soon'}" data-unit="${u.id}" ${ready ? '' : 'disabled'}>
          <span class="unit-emoji">${u.emoji}</span>
          <span class="unit-no">Lớp ${u.grade} · Unit ${u.no}</span>
          <span class="unit-title">${esc(u.title)}</span>
          <span class="unit-vi muted small">${esc(u.titleVi)}</span>
          <span class="unit-foot">
            ${ready ? `${ring(s.total ? s.mastered / s.total : 0, '', 30)}<span class="small muted">${s.mastered}/${s.total} từ đã thuộc${s.due ? ` · <b class="due">${s.due} cần ôn</b>` : ''}</span>`
                    : '<span class="small muted">🔒 Sắp có</span>'}
          </span>
        </button>`;
    }).join('') : '<p class="muted center">Không tìm thấy chủ đề nào 🤔</p>';
  }

  el.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    currentGrade = +b.dataset.grade;
    q.value = '';
    render();
  });
  q.addEventListener('input', render);
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.unit');
    if (b && !b.disabled) chooseDifficulty(cur, b.dataset.unit, st.track);
  });
  render();
}

function chooseDifficulty(cur, unitId, track) {
  const unit = cur.grades.flatMap((g) => g.units).find((u) => u.id === unitId);
  const lastD = store.get().last?.difficulty || 'easy';
  const desc = DIFF_DESC[track] || DIFF_DESC.thpt;
  sheet(`
    <div class="sheet-handle"></div>
    <div class="sheet-head"><span class="unit-emoji">${unit.emoji}</span><div><b>${esc(unit.title)}</b><div class="muted small">${esc(unit.titleVi)}</div></div></div>
    <p class="muted">Chọn độ khó:</p>
    <div class="diff-list">
      ${Object.entries(DIFFICULTY).map(([k, d]) => `
        <button class="diff ${k === lastD ? 'suggest' : ''}" data-d="${k}">
          <span class="diff-emoji">${d.emoji}</span>
          <span><b>${d.label}</b><span class="muted small">${desc[k]}</span></span>
        </button>`).join('')}
    </div>`, (box, close) => {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.diff');
      if (!b) return;
      close();
      go(`#/play?unit=${unitId}&d=${b.dataset.d}`);
    });
  });
}

// "Học môn gì?": mỗi môn đang mở một thẻ (số câu đến hạn ôn), môn chưa mở hiện "🔒 Sắp có" ở cuối, bấm không vào.
// Chỉ hiện khi lộ trình có từ 2 môn mở trở lên (hoặc thử với ?thu=chonmon ở localhost), xem core/subject.js.
import * as store from '../core/store.js';
import { getSubjects, getAllWords, getModuleItems, getTrack } from '../core/data.js';
import { isDue, allowedPriorities } from '../core/srs.js';
import { modulesOf } from '../modules/_registry.js';
import { openSubjects, saveSubject, vatlyFlag } from '../core/subject.js';
import { esc, go } from '../ui/dom.js';

// Số từ + câu bài tập của môn đã đến hạn ôn. Phần nào tải lỗi (mất mạng) thì bỏ qua phần đó.
async function dueOf(st, sid) {
  const now = Date.now();
  const prios = allowedPriorities(st.settings.extended);
  const words = await getAllWords(st.track, sid).catch(() => []);
  let n = words.filter((w) => prios.includes(w.priority ?? 2) && isDue(st.progress[w.id], now)).length;
  for (const m of modulesOf(st.track, sid).filter((x) => x.route?.startsWith('#/ex'))) {
    const items = await getModuleItems(m.id, st.track, sid).catch(() => []);
    n += items.filter((it) => isDue(st.progress[it.id], now)).length;
  }
  return n;
}

export async function mount(el, params, { isCurrent = () => true } = {}) {
  const st = store.get();
  const track = await getTrack(st.track);
  const all = await getSubjects(st.track);
  const open = openSubjects(all, { thu: vatlyFlag(location) });
  const locked = all.filter((s) => !open.includes(s));
  const due = await Promise.all(open.map((s) => dueOf(st, s.id)));
  if (!isCurrent()) return;
  const streak = store.streak();

  el.innerHTML = `
    <section class="screen subjects">
      <header class="topbar">
        <div>
          <div class="muted small">${track ? `${track.emoji} ${esc(track.title)}` : ''}</div>
          <h1 class="title-lg">Hôm nay học môn gì? 📚</h1>
        </div>
        <div class="topbar-actions"><span class="stat-big">🔥 ${streak}</span></div>
      </header>
      <div class="modules">
        ${open.map((s, i) => `
          <a class="module" href="#/home" data-sid="${esc(s.id)}">
            <span class="module-emoji">${esc(s.emoji || '📘')}</span>
            <span class="module-text"><b>${esc(s.title)}</b><span class="muted small">${esc(s.desc || '')}</span>
              <span class="muted small">${due[i] ? `🔁 ${due[i]} từ & câu đến hạn ôn` : 'Chưa có gì đến hạn ôn ✨'}</span></span>
            <span class="module-tag">›</span>
          </a>`).join('')}
        ${locked.map((s) => `
          <a class="module locked" aria-disabled="true">
            <span class="module-emoji">${esc(s.emoji || '📘')}</span>
            <span class="module-text"><b>${esc(s.title)}</b><span class="muted small">${esc(s.desc || '')}</span></span>
            <span class="module-tag">🔒 Sắp có</span>
          </a>`).join('')}
      </div>
    </section>`;

  el.querySelector('.modules').addEventListener('click', (e) => {
    const a = e.target.closest('[data-sid]');
    e.preventDefault();
    if (!a) return;
    // Nhớ môn vừa chọn trên máy này: lần sau mở app vào thẳng môn đó.
    saveSubject(st.id, a.dataset.sid);
    go('#/home');
  });
}

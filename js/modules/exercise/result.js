// Kết quả một bài tập: điểm, các câu sai kèm đáp án + giải thích, ô ý kiến.
import * as store from '../../core/store.js';
import { getModuleItems, currentSubject } from '../../core/data.js';
import { sfx } from '../../core/sound.js';
import { findModule } from '../_registry.js';
import { mascotSVG, LINES, pick } from '../../ui/mascot.js';
import { confetti } from '../../ui/confetti.js';
import { esc, go, toast } from '../../ui/dom.js';
import { rich, answerText, questionText } from './check.js';
import { parseCapUnit } from '../../core/level.js';

export async function mount(el, params, { isCurrent = () => true } = {}) {
  const st = store.get();
  const mod = findModule(st.track, params.m, currentSubject());
  const s = st.sessions.find((x) => x.sessionId === params.sid);
  if (!s || !mod) { go('#/home'); return; }
  const byId = new Map((await getModuleItems(mod.id)).map((it) => [it.id, it]));
  if (!isCurrent()) return;
  const wrong = s.wrongIds.map((id) => byId.get(id)).filter(Boolean);
  const rate = s.total ? s.correct / s.total : 0;
  const line = pick(rate >= 0.8 ? LINES.doneGreat : rate >= 0.5 ? LINES.doneOk : LINES.doneLow);
  const isReview = s.unitId.startsWith('review-');
  const capUnit = mod.id === 'vl-chu-de' ? parseCapUnit(s.unitId) : null;
  const up = capUnit && [2, 3, 4].includes(Number(params.up)) ? Number(params.up) : null;

  el.innerHTML = `
    <section class="screen result">
      <div class="center">
        <div class="mascot big bob">${mascotSVG(rate >= 0.8 ? 'happy' : rate >= 0.5 ? 'wow' : 'think')}</div>
        <h1 class="title-lg">${esc(st.settings.mascotName)}: “${esc(line)}”</h1>
        <div class="score"><b>${s.correct}</b>/${s.total} câu đúng · ⏱️ ${Math.max(1, Math.round(s.activeSeconds / 60))} phút</div>
        <div class="muted small">${mod.emoji} ${esc(mod.title)}</div>
        ${up ? `<h2 class="section-title cap-up">${up === 4 ? '🏅 Làm chủ chủ đề' : `🎉 Lên cấp ${up}: ${up === 2 ? 'Hiểu' : 'Vận dụng'}`}</h2>` : ''}
      </div>
      ${wrong.length ? `
      <div class="card">
        <h2 class="section-title">Câu cần xem lại (${wrong.length})</h2>
        <ul class="plain wrong-list">
          ${wrong.map((it) => `<li>${it.group ? `<p class="muted small">📄 ${esc(it.group.title || 'Đoạn văn')}</p>` : ''}<p>${it.type === 'mcq' || it.type === 'input' || it.type === 'num' || it.type === 'tf4' ? rich(it.prompt) : esc(questionText(it))}</p>${it.type === 'mcq' ? `<p class="muted small">${it.options.map((o, i) => `${'ABCD'[i]}. ${rich(o)}`).join(' · ')}</p>` : ''}
            <p>✅ <b>${esc(answerText(it))}</b></p>${it.type === 'tf4' ? `<ul class="plain muted small">${it.explain.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>` : it.explain ? `<p class="muted small">${rich(it.explain)}</p>` : ''}</li>`).join('')}
        </ul>
        <p class="muted small">Các câu này sẽ quay lại trong mục “Ôn câu làm sai” vào ngày mai.</p>
      </div>` : '<div class="card center">🏆 Đúng hết. Quá giỏi!</div>'}
      <div class="card feedback">
        <h2 class="section-title">Bài này thấy sao? <span class="muted small">(bỏ qua cũng được)</span></h2>
        <div class="chips" id="rating">
          <button class="chip-btn" data-r="easy">😌 Dễ</button><button class="chip-btn" data-r="ok">🙂 Vừa</button><button class="chip-btn" data-r="hard">😵 Khó</button>
        </div>
        <textarea id="note" rows="2" maxlength="300" placeholder="Ghi chú cho mình… (vd: phần này chưa hiểu, muốn thêm bài…)"></textarea>
        <div class="row">
          <button class="btn btn-primary" data-next="same">${isReview ? '🔁 Ôn tiếp' : '🔁 Làm lại bài này'}</button>
          <button class="btn btn-soft" data-next="change">📚 Chọn bài khác</button>
        </div>
        <a class="link center" href="#/home" data-next="home">Về trang chủ</a>
      </div>
    </section>`;

  sfx.done();
  if (rate >= 0.5 || up) confetti();

  let rating = null;
  el.querySelector('#rating').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rating = rating === b.dataset.r ? null : b.dataset.r;
    el.querySelectorAll('#rating .chip-btn').forEach((x) => x.classList.toggle('active', x.dataset.r === rating));
  });
  let sent = false;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-next]');
    if (!b) return;
    e.preventDefault();
    const nextChoice = b.dataset.next;
    const note = el.querySelector('#note').value.trim();
    if (!sent && (rating || note || nextChoice !== 'home')) {
      sent = true;
      store.recordFeedback({ sessionId: s.sessionId, at: Date.now(), unitId: s.unitId, difficulty: mod.id, rating, next: nextChoice, note });
      if (rating || note) toast('Đã ghi lại ý kiến, cảm ơn nha 💜');
    }
    const setParam = capUnit ? `cap&topic=${encodeURIComponent(capUnit.topic)}` : isReview ? 'review' : s.unitId;
    if (nextChoice === 'same') go(`#/ex-play?m=${mod.id}&set=${setParam}&r=${Date.now()}`);
    else if (nextChoice === 'change') go(`#/ex?m=${mod.id}`);
    else go('#/home');
  });
}

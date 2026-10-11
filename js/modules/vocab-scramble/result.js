import * as store from '../../core/store.js';
import { getAllWords, findUnit } from '../../core/data.js';
import { DIFFICULTY } from '../../core/srs.js';
import { sfx } from '../../core/sound.js';
import { speak } from '../../core/speech.js';
import { mascotSVG, LINES, pick } from '../../ui/mascot.js';
import { confetti } from '../../ui/confetti.js';
import { esc, go, toast } from '../../ui/dom.js';

export async function mount(el, params) {
  const st = store.get();
  const s = st.sessions.find((x) => x.sessionId === params.sid);
  if (!s) { go('#/home'); return; }
  const unit = s.unitId === 'review' ? null : await findUnit(s.unitId);
  const byId = new Map((await getAllWords()).map((w) => [w.id, w]));
  const wrong = s.wrongIds.map((id) => byId.get(id)).filter(Boolean);
  const rate = s.total ? s.correct / s.total : 0;
  const mood = rate >= 0.8 ? 'happy' : rate >= 0.5 ? 'wow' : 'think';
  const line = pick(rate >= 0.8 ? LINES.doneGreat : rate >= 0.5 ? LINES.doneOk : LINES.doneLow);
  const mins = Math.max(1, Math.round(s.activeSeconds / 60));
  const D = DIFFICULTY[s.difficulty];

  el.innerHTML = `
    <section class="screen result">
      <div class="center">
        <div class="mascot big bob">${mascotSVG(mood)}</div>
        <h1 class="title-lg">${esc(st.settings.mascotName)}: “${esc(line)}”</h1>
        <div class="score"><b>${s.correct}</b>/${s.total} đúng ngay lần đầu · ⏱️ ${mins} phút</div>
        <div class="muted small">${unit ? `${unit.emoji} ${esc(unit.title)}` : '🔁 Ôn từ đến hạn'} · ${D.emoji} ${D.label}</div>
      </div>

      ${wrong.length ? `
      <div class="card">
        <h2 class="section-title">Từ cần ôn thêm (${wrong.length})</h2>
        <ul class="word-list">
          ${wrong.map((w) => `<li><button class="icon-btn small-btn" data-say="${esc(w.word)}" aria-label="Nghe">🔊</button><b>${esc(w.word)}</b><span class="muted">${esc(w.vi)}</span></li>`).join('')}
        </ul>
      </div>` : '<div class="card center">🏆 Không sai từ nào. Đỉnh!</div>'}

      <div class="card feedback">
        <h2 class="section-title">Bài này thấy sao? <span class="muted small">(bỏ qua cũng được)</span></h2>
        <div class="chips" id="rating">
          <button class="chip-btn" data-r="easy">😌 Dễ</button>
          <button class="chip-btn" data-r="ok">🙂 Vừa</button>
          <button class="chip-btn" data-r="hard">😵 Khó</button>
        </div>
        <textarea id="note" rows="2" maxlength="300" placeholder="Ghi chú cho mình… (vd: muốn thêm từ về AI, từ này khó nhớ…)"></textarea>
        <p class="muted small">Tiếp theo bạn muốn:</p>
        <div class="row">
          <button class="btn btn-primary" data-next="same">🔁 Làm tiếp dạng này</button>
          <button class="btn btn-soft" data-next="change">🧭 Đổi chủ đề</button>
        </div>
        <a class="link center" href="#/home" data-next="home">Về trang chủ</a>
      </div>
    </section>`;

  sfx.done();
  if (rate >= 0.5) confetti();

  let rating = null;
  el.querySelector('#rating').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rating = rating === b.dataset.r ? null : b.dataset.r;
    el.querySelectorAll('#rating .chip-btn').forEach((x) => x.classList.toggle('active', x.dataset.r === rating));
  });
  el.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.say, st.settings.voice)));

  let sent = false;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-next]');
    if (!b) return;
    e.preventDefault();
    const nextChoice = b.dataset.next;
    const note = el.querySelector('#note').value.trim();
    if (!sent && (rating || note || nextChoice !== 'home')) {
      sent = true;
      store.recordFeedback({ sessionId: s.sessionId, at: Date.now(), unitId: s.unitId, difficulty: s.difficulty, rating, next: nextChoice, note });
      if (rating || note) toast('Đã ghi lại ý kiến, cảm ơn nha 💜');
    }
    if (nextChoice === 'same') go(`#/play?unit=${s.unitId}&d=${s.difficulty}&r=${Date.now()}`);
    else if (nextChoice === 'change') go('#/topics');
    else go('#/home');
  });
}

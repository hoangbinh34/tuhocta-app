// Đề thi thử: cả đề trên một trang, đồng hồ đếm ngược, nộp bài → chấm điểm theo thang của trường,
// xem lại từng câu kèm giải thích. Đang làm dở mà thoát thì lần sau làm tiếp (lưu nháp trên máy).
import * as store from '../../core/store.js';
import { getExerciseSet, currentSubject, getSubject, imgUrl } from '../../core/data.js';
import { review } from '../../core/srs.js';
import { sfx } from '../../core/sound.js';
import { findModule } from '../_registry.js';
import { mascotSVG } from '../../ui/mascot.js';
import { confetti } from '../../ui/confetti.js';
import { esc, go, toast, isPhone } from '../../ui/dom.js';
import { checkInput, checkError, checkNum, checkTf4, tf4Text, numKey, rich, plain, wordCount, answerText, shuffleOptions, canShuffle, flattenItems, scoreTest } from './check.js';

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const passageHTML = (p) => String(p || '').split(/\n{2,}/).map((para) => `<p>${rich(para).replace(/\n/g, '<br>')}</p>`).join('');
const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export async function mount(el, params, { isCurrent = () => true } = {}) {
  const st = store.get();
  const mod = findModule(st.track, params.m, currentSubject());
  if (!mod?.enabled) { go('#/home'); return; }
  const test = await getExerciseSet(mod.id, params.set);
  if (!isCurrent()) return;
  if (!test) { go(`#/ex?m=${mod.id}`); return; }

  // Đánh số câu liên tục trong cả đề; câu trong đoạn văn cũng được đánh số.
  const flat = flattenItems(test).map((q) => ({ ...q, si: test.sections.findIndex((sec) => sec.title === q.section), groupId: q.group?.id }));
  flat.forEach((q, i) => { q.no = i + 1; });
  const autoItems = flat.filter((q) => q.type !== 'writing' && q.type !== 'card');
  const subject = await getSubject(st.track, currentSubject());
  const draftKey = `tuhocta.mock.${st.id}.${test.id}`;
  const loadDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { return null; } };
  const saveDraft = (d) => { try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch { /* bỏ qua */ } };
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* bỏ qua */ } };

  const draft = loadDraft();
  const expired = draft && draft.endsAt <= Date.now();

  // ---------- màn bắt đầu ----------
  el.innerHTML = `
    <section class="screen mock-start">
      <header class="topbar"><a class="icon-btn" href="#/ex?m=${mod.id}" aria-label="Quay lại">←</a><h1 class="title-md">${esc(mod.title)}</h1><span class="icon-btn ghost"></span></header>
      <div class="center"><div class="mascot big bob">${mascotSVG('wow')}</div></div>
      <div class="card">
        <h2 class="title-md">${esc(test.title)}</h2>
        <p class="muted">${esc(test.desc || '')}</p>
        <ul class="plain">
          <li>⏱️ Thời gian: <b>${test.minutes} phút</b></li>
          <li>📝 Số câu: <b>${flat.length}</b>${flat.length > autoItems.length ? ` (${flat.length - autoItems.length} câu viết tự chấm)` : ''}</li>
          <li>🏅 Thang điểm: <b>${test.scale}</b></li>
          <li>📚 Gồm: ${test.sections.map((s) => esc(s.title)).join(' · ')}</li>
        </ul>
        <p class="muted small">Làm như thi thật: hết giờ app tự nộp bài. Có thể làm câu nào trước cũng được.</p>
      </div>
      <button class="btn btn-primary btn-lg" id="start">${expired ? '📊 Bài làm dở đã hết giờ: xem kết quả' : draft ? '▶ Làm tiếp bài đang dở' : '🚀 Bắt đầu làm bài'}</button>
      ${draft ? '<button class="link center" id="restart">Làm lại từ đầu</button>' : ''}
    </section>`;
  el.querySelector('#start').addEventListener('click', () => begin(draft));
  el.querySelector('#restart')?.addEventListener('click', () => { clearDraft(); begin(null); });

  let timer = null;
  function begin(d) {
    let submitted = false;
    const sessionId = d?.sessionId || newId();
    const startedAt = d?.startedAt || Date.now();
    const endsAt = d?.endsAt || Date.now() + test.minutes * 60e3;
    const answers = d?.answers || {};   // id -> chỉ số phương án GỐC | chữ gõ | {picked, text} | bài viết
    // Trộn phương án trắc nghiệm một lần cho mỗi lượt làm; lưu vào nháp để làm tiếp vẫn đúng thứ tự.
    const orders = d?.orders || {};
    for (const q of flat) {
      if (q.type === 'mcq' && !orders[q.id]) {
        orders[q.id] = !q.noShuffle && canShuffle(q.options) ? shuffleOptions(q.options, q.answer).order : q.options.map((_, i) => i);
      }
    }
    const persist = () => saveDraft({ sessionId, startedAt, endsAt, answers, orders });
    persist();

    const qHTML = (q) => {
      const a = answers[q.id];
      const num = `<span class="q-no">${q.no}</span>`;
      const head = `${q.prompt ? `<p class="q-prompt sm">${rich(q.prompt)}</p>` : ''}${q.img ? `<img class="question-img" src="${imgUrl(subject?.exercises, q.img)}" alt="Hình minh hoạ câu hỏi">` : ''}`;
      if (q.type === 'mcq') return `<div class="mq" data-q="${q.id}">${num}<div class="mq-body">${head}
        <div class="opts compact">${orders[q.id].map((oi, pos) => `<button class="opt ${a === oi ? 'picked' : ''}" data-q="${q.id}" data-i="${oi}"><span class="opt-key">${'ABCD'[pos]}</span><span class="opt-text">${rich(q.options[oi])}</span></button>`).join('')}</div></div></div>`;
      if (q.type === 'tf4') return `<div class="mq" data-q="${q.id}">${num}<div class="mq-body">${head}<div class="tf4">${q.statements.map((s, i) => `<div class="tf-row"><span>${rich(s)}</span><span><button class="btn btn-soft ${a?.[i] === true ? 'picked' : ''}" data-tf="${q.id}" data-i="${i}" data-v="true">Đ</button><button class="btn btn-soft ${a?.[i] === false ? 'picked' : ''}" data-tf="${q.id}" data-i="${i}" data-v="false">S</button></span></div>`).join('')}</div></div></div>`;
      if (q.type === 'num') return `<div class="mq" data-q="${q.id}">${num}<div class="mq-body">${head}<div class="num-answer"><b data-num-answer="${q.id}">${esc(a || '')}</b>${q.unit ? `<span class="muted"> ${rich(q.unit)}</span>` : ''}</div><div class="num-pad">${['1','2','3','4','5','6','7','8','9',',','0','-','⌫'].map((k) => `<button class="btn btn-soft" data-num="${q.id}" data-key="${k}">${k}</button>`).join('')}</div></div></div>`;
      if (q.type === 'input') return `<div class="mq" data-q="${q.id}">${num}<div class="mq-body"><p class="q-prompt sm">${rich(q.prompt)}</p>${q.lead ? `<p class="q-lead">→ ${rich(q.lead)}</p>` : ''}
        <input class="mq-input" data-q="${q.id}" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(a || '')}" placeholder="Gõ đáp án…"></div></div>`;
      if (q.type === 'error') return `<div class="mq" data-q="${q.id}">${num}<div class="mq-body"><p class="muted small">Bấm vào từ sai, rồi gõ từ đúng.</p>
        <div class="err-tokens">${q.tokens.map((t, i) => `<button class="tok ${a?.picked === i ? 'picked' : ''}" data-q="${q.id}" data-t="${i}">${esc(t)}</button>`).join(' ')}</div>
        <input class="mq-input" data-q="${q.id}" data-err="1" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(a?.text || '')}" placeholder="Sửa thành…"></div></div>`;
      if (q.type === 'writing') return `<div class="mq" data-q="${q.id}">${num}<div class="mq-body"><p class="q-prompt sm">${rich(q.prompt)}</p>
        <textarea class="mq-essay" data-q="${q.id}" rows="5" placeholder="Viết bằng tiếng Anh (${q.minWords}–${q.maxWords} từ)…">${esc(a || '')}</textarea>
        <p class="muted small" data-wc="${q.id}">${wordCount(a)} từ</p></div></div>`;
      return '';
    };

    const sectionHTML = (sec, si) => {
      let html = `<section class="mock-sec card"><h2 class="section-title">${esc(sec.title)}</h2>${sec.instruction ? `<p class="muted small">${esc(sec.instruction)}</p>` : ''}`;
      for (const it of sec.items) {
        if (it.type === 'group') {
          html += `<div class="passage inner">${it.title ? `<p class="section-title">📄 ${esc(it.title)}</p>` : ''}${passageHTML(it.passage)}</div>`;
          html += flat.filter((q) => q.groupId === it.id).map(qHTML).join('');
        } else html += qHTML(flat.find((q) => q.id === it.id && q.si === si));
      }
      return html + '</section>';
    };

    el.innerHTML = `
      <section class="screen mock">
        <header class="mock-bar">
          <button class="icon-btn" id="leave" aria-label="Thoát (lưu bài đang làm)">✕</button>
          <span class="mock-timer" id="timer">${fmt(endsAt - Date.now())}</span>
          <span class="muted small" id="answered"></span>
          <button class="btn btn-primary" id="submit">Nộp bài</button>
        </header>
        <h1 class="title-md">${esc(test.title)}</h1>
        ${test.sections.map(sectionHTML).join('')}
        <button class="btn btn-primary btn-lg" id="submit2">Nộp bài</button>
      </section>`;

    // Một câu được tính là đã làm: chọn/gõ xong; câu tìm lỗi phải vừa chọn từ vừa gõ từ sửa.
    const isAnswered = (q) => { const a = answers[q.id]; return q.type === 'error' ? a?.picked != null && !!String(a?.text || '').trim() : q.type === 'tf4' ? Array.isArray(a) && a.length === 4 && a.every((x) => typeof x === 'boolean') : a !== undefined && String(a).trim() !== ''; };
    const updateCount = () => {
      const n = flat.filter(isAnswered).length;
      el.querySelector('#answered').textContent = `${n}/${flat.length} câu`;
    };
    updateCount();

    el.addEventListener('click', (e) => {
      const o = e.target.closest('.opt[data-q]');
      if (o && !o.disabled) {
        answers[o.dataset.q] = +o.dataset.i;
        el.querySelectorAll(`.opt[data-q="${o.dataset.q}"]`).forEach((x) => x.classList.toggle('picked', x === o));
        sfx.tick(); persist(); updateCount(); return;
      }
      const t = e.target.closest('.tok[data-q]');
      if (t && !t.disabled) {
        const a = answers[t.dataset.q] = { ...(answers[t.dataset.q] || {}), picked: +t.dataset.t };
        el.querySelectorAll(`.tok[data-q="${t.dataset.q}"]`).forEach((x) => x.classList.toggle('picked', x === t));
        void a; persist(); updateCount();
      }
      const tf = e.target.closest('[data-tf]');
      if (tf && !tf.disabled) {
        const a = answers[tf.dataset.tf] = Array.isArray(answers[tf.dataset.tf]) ? answers[tf.dataset.tf] : Array(4).fill(null);
        a[+tf.dataset.i] = tf.dataset.v === 'true';
        el.querySelectorAll(`[data-tf="${tf.dataset.tf}"][data-i="${tf.dataset.i}"]`).forEach((x) => x.classList.toggle('picked', x === tf));
        persist(); updateCount(); return;
      }
      const nk = e.target.closest('[data-num]');
      if (nk && !nk.disabled) {
        answers[nk.dataset.num] = numKey(answers[nk.dataset.num] || '', nk.dataset.key);
        el.querySelector(`[data-num-answer="${nk.dataset.num}"]`).textContent = answers[nk.dataset.num];
        persist(); updateCount();
      }
    });
    el.addEventListener('input', (e) => {
      const inp = e.target.closest('.mq-input, .mq-essay');
      if (!inp) return;
      const id = inp.dataset.q;
      if (inp.dataset.err) answers[id] = { ...(answers[id] || {}), text: inp.value };
      else answers[id] = inp.value;
      if (inp.classList.contains('mq-essay')) el.querySelector(`[data-wc="${id}"]`).textContent = `${wordCount(inp.value)} từ`;
      persist(); updateCount();
    });

    const tick = () => {
      const left = endsAt - Date.now();
      const tEl = el.querySelector('#timer');
      if (!tEl) return;
      tEl.textContent = fmt(left);
      tEl.classList.toggle('warn', left < 5 * 60e3);
      if (left <= 0) { toast('Hết giờ! App tự nộp bài.'); submit(); }
    };
    const confirmSubmit = () => {
      const left = flat.length - flat.filter(isAnswered).length;
      if (left > 0 && !window.confirm(`Còn ${left} câu chưa làm. Vẫn nộp bài?`)) return;
      submit();
    };
    el.querySelector('#submit').addEventListener('click', confirmSubmit);
    el.querySelector('#submit2').addEventListener('click', confirmSubmit);
    el.querySelector('#leave').addEventListener('click', () => { toast('Đã lưu bài đang làm, lần sau làm tiếp nhé'); go(`#/ex?m=${mod.id}`); });

    // Nháp đã hết giờ: chấm luôn, không chạy đồng hồ nữa.
    if (endsAt <= Date.now()) { submit(); return; }
    timer = setInterval(tick, 1000);

    function submit() {
      if (submitted) return;
      submitted = true;
      clearInterval(timer);
      const now = Date.now();
      const results = flat.map((q) => {
        const a = answers[q.id];
        let ok = false, given = '';
        if (q.type === 'mcq') { ok = a === q.answer; given = a == null ? '' : plain(q.options[a]); }
        else if (q.type === 'input') { ok = checkInput(a, q.answers, q.lead); given = a || ''; }
        else if (q.type === 'error') { ok = checkError(a?.picked, a?.text, q.wrong, q.answers); given = a ? `${q.tokens[a.picked] ?? '?'} → ${a.text || ''}` : ''; }
        else if (q.type === 'tf4') { const r = checkTf4(a, q.answers); ok = r.ok; given = tf4Text(a); }
        else if (q.type === 'num') { ok = checkNum(a, q.answer, q.round, q.tolerance, q.exact).ok; given = a || ''; }
        else if (q.type === 'writing') { given = a || ''; }
        return { q, ok, given, answered: given !== '' };
      });
      const auto = results.filter((r) => r.q.type !== 'writing' && r.q.type !== 'card');
      const correct = auto.filter((r) => r.ok).length;
      const score = scoreTest(test, answers).score;
      const attempts = results.filter((r) => r.answered || r.q.type !== 'writing').map((r) => ({
        sessionId, wordId: r.q.id, correct: r.q.type === 'writing' ? true : r.ok, usedHint: false, tries: 1, revealed: false, ms: 0, at: now,
        given: String(r.given).slice(0, r.q.type === 'writing' ? 2000 : 120), kind: r.q.type,
      }));
      for (const r of auto) st.progress[r.q.id] = review(st.progress[r.q.id], { correct: r.ok, usedHint: false }, now);
      store.recordSession({
        sessionId, startedAt, endedAt: now, activeSeconds: Math.round((Math.min(now, endsAt) - startedAt) / 1000),
        module: mod.id, unitId: test.id, difficulty: `${score}/${test.scale}`,
        total: auto.length, correct, hintsUsed: 0, wrongIds: auto.filter((r) => !r.ok).map((r) => r.q.id),
        partial: false, device: isPhone() ? 'phone' : 'laptop',
      }, attempts);
      clearDraft();
      showResult(results, score, correct, auto.length);
    }

    function showResult(results, score, correct, total) {
      const bySec = test.sections.map((sec, si) => {
        const rs = results.filter((r) => r.q.si === si && r.q.type !== 'writing');
        return { title: sec.title, ok: rs.filter((r) => r.ok).length, n: rs.length };
      });
      const rate = total ? correct / total : 0;
      el.innerHTML = `
        <section class="screen result mock-result">
          <div class="center">
            <div class="mascot big bob">${mascotSVG(rate >= 0.8 ? 'happy' : rate >= 0.5 ? 'wow' : 'think')}</div>
            <div class="score"><b>${String(score).replace('.', ',')}</b> / ${test.scale} điểm</div>
            <div class="muted">${correct}/${total} câu đúng · ${esc(test.title)}</div>
            ${results.some((r) => r.q.type === 'writing') ? `<p class="muted small">Điểm chỉ tính ${total} câu tự chấm; câu viết đoạn con tự so với bài mẫu (chưa tính vào điểm).</p>` : ''}
          </div>
          <div class="card">
            <h2 class="section-title">Theo từng phần</h2>
            <ul class="plain">${bySec.filter((b) => b.n).map((b) => `<li>${esc(b.title)}: <b>${b.ok}/${b.n}</b></li>`).join('')}</ul>
          </div>
          <div class="card">
            <h2 class="section-title">Xem lại bài làm</h2>
            <ol class="plain review-list">
              ${results.map((r) => `<li class="${r.q.type === 'writing' ? '' : r.ok ? 'ok' : 'bad'}">
                <p><b>Câu ${r.q.no}.</b> ${r.q.type === 'error' ? esc(r.q.tokens.join(' ')) : rich(r.q.prompt || '')}${r.q.lead ? `<br>→ ${rich(r.q.lead)} …` : ''}</p>
                ${r.q.type === 'writing'
                  ? `<p class="muted small">Bài của con: ${esc(r.given) || '(chưa viết)'}</p><details class="sample"><summary>📘 Bài mẫu</summary><p>${esc(r.q.sample)}</p></details>`
                  : `<p>${r.ok ? '✅' : '❌'} Con chọn: <b>${esc(r.given) || '(bỏ trống)'}</b>${r.ok ? '' : ` · Đáp án: <b>${esc(answerText(r.q))}</b>`}</p>`}
                ${r.q.type === 'tf4' ? `<ul class="plain muted small">${r.q.explain.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>` : r.q.explain ? `<p class="muted small">${rich(r.q.explain)}</p>` : ''}
              </li>`).join('')}
            </ol>
          </div>
          <div class="row">
            <a class="btn btn-soft" href="#/ex?m=${mod.id}">📚 Chọn đề khác</a>
            <a class="btn btn-primary" href="#/home">Về trang chủ</a>
          </div>
        </section>`;
      window.scrollTo(0, 0);
      sfx.done();
      if (rate >= 0.5) confetti();
    }
  }

  // Bài đang làm đã được lưu nháp sau mỗi lần chọn/gõ, nên rời màn chỉ cần dừng đồng hồ.
  return () => clearInterval(timer);
}

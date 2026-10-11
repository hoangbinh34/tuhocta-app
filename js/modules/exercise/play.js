// Màn làm bài tập dùng chung. Kiểu câu hỏi:
//   mcq (trắc nghiệm) · input (gõ đáp án) · order (sắp xếp) · error (tìm và sửa lỗi) · writing (viết đoạn)
//   và group (đoạn văn + nhiều câu hỏi) được tách thành từng câu, câu nào cũng hiện kèm đoạn văn.
import * as store from '../../core/store.js';
import { lastByEntry } from '../../core/subject.js';
import { getExerciseSet, getExerciseSets, getModuleMeta, getModuleItems, currentSubject, getSubject, imgUrl } from '../../core/data.js';
import { capFlagCfg, canPlace, windowStat, pickSession, placementItems, recordAnswer, applyPlacement, placementLevel, capUnitId } from '../../core/level.js';
import { review, isDue } from '../../core/srs.js';
import { sfx, setEnabled } from '../../core/sound.js';
import { speak } from '../../core/speech.js';
import { findModule } from '../_registry.js';
import { mascotSVG, LINES, pick } from '../../ui/mascot.js';
import { esc, go, toast, sheet, isPhone } from '../../ui/dom.js';
import { checkInput, checkOrder, checkError, checkNum, checkTf4, tf4Text, numKey, shuffleOptions, shuffleParts, canShuffle, rich, plain, wordCount, flattenItems, answerText, orderQueue } from './check.js';

const IDLE_MS = 60_000;
const REVIEW_SIZE = 12;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// Đoạn văn: giữ xuống dòng, gạch chân, ô trống.
const passageHTML = (p) => String(p || '').split(/\n{2,}/).map((para) => `<p>${rich(para).replace(/\n/g, '<br>')}</p>`).join('');

export async function mount(el, params, { isCurrent = () => true } = {}) {
  const st = store.get();
  const settings = st.settings;
  const mod = findModule(st.track, params.m, currentSubject());
  if (!mod?.enabled) { go('#/home'); return; }
  const isReview = params.set === 'review';
  const isCap = mod.id === 'vl-chu-de' && params.set === 'cap';
  const isPlace = mod.id === 'vl-chu-de' && params.set === 'place';
  const cfg = capFlagCfg(location);
  let cap = isCap || isPlace ? settings.cap || {} : {};
  const topic = params.topic;
  if (isPlace && !canPlace(cap, topic)) { go(`#/ex-play?m=${mod.id}&set=cap&topic=${encodeURIComponent(topic)}`); return; }

  let set, items;
  if (isCap || isPlace) {
    const meta = await getModuleMeta(mod.id);
    const group = meta?.topics?.find((t) => t.id === topic);
    const sets = await getExerciseSets(mod.id);
    const ids = new Set(sets.filter((s) => s.topic === topic).map((s) => s.id));
    if (!group || !ids.size) { go(`#/ex?m=${mod.id}`); return; }
    const bank = (await getModuleItems(mod.id)).filter((it) => ids.has(it.setId) && it.type !== 'card');
    items = isPlace ? placementItems(bank, st.progress, undefined, cfg) : pickSession(bank, st.progress, cap, topic, Date.now(), undefined, cfg);
    const lv = windowStat(cap, topic, cfg).lv;
    set = { id: capUnitId(isPlace ? 'place' : 'cap', topic), title: `${group.title} · ${isPlace ? 'Xếp cấp' : lv === 4 ? 'Ôn chủ đề' : `Luyện cấp ${lv}`}`, emoji: group.emoji, shuffleItems: false };
    if (!isCurrent()) return;
    if (isCap && lv === 4 && !items.length) { toast('🏅 Chưa có câu cần ôn'); go(`#/ex?m=${mod.id}`); return; }
  } else if (isReview) {
    const now = Date.now();
    items = (await getModuleItems(mod.id))
      .filter((it) => isDue(st.progress[it.id], now))
      .sort((a, b) => st.progress[a.id].dueAt - st.progress[b.id].dueAt)
      .slice(0, REVIEW_SIZE);
    set = { id: `review-${mod.id}`, title: 'Ôn câu làm sai / đến hạn', emoji: '🔁', intro: '', instruction: '' };
  } else {
    set = await getExerciseSet(mod.id, params.set);
    items = set ? flattenItems(set).map((it) => ({ ...it, setId: set.id })) : [];
  }
  if (!isCurrent()) return;
  if (!items.length) { toast(isReview ? 'Chưa có câu nào cần ôn ✨' : 'Bài này chưa có câu hỏi'); go(`#/ex?m=${mod.id}`); return; }
  const queue = orderQueue(items, isReview || set.shuffleItems !== false);
  const subject = await getSubject(st.track, currentSubject());

  // ---------- trạng thái ----------
  const sessionId = newId();
  const startedAt = Date.now();
  function saveLastBy(now) {
    const entry = lastByEntry(mod.id, set.id, { isReview }, now);
    if (entry) {
      st.lastBy = { ...(st.lastBy || {}), vatly: entry };
      store.save();
    }
  }
  saveLastBy(startedAt);
  let activeMs = 0, lastAct = Date.now();
  const touch = () => { const n = Date.now(); if (n - lastAct < IDLE_MS) activeMs += n - lastAct; lastAct = n; };
  const attempts = [];
  const placementResults = [];
  let highestUp = null;
  let idx = 0, done = false, finished = false, cur = null;

  el.innerHTML = `
    <section class="screen play ex-play">
      <header class="play-top">
        <button class="icon-btn" id="quit" aria-label="Dừng bài">✕</button>
        <div class="bar" aria-hidden="true"><div class="bar-fill" id="bar"></div></div>
        <span class="count" id="count"></span>
        <button class="icon-btn" id="mute" aria-label="Bật/tắt âm thanh"></button>
      </header>
      <div class="play-meta muted small">${mod.emoji} ${esc(mod.title)} · ${esc(set.title)}</div>
      ${set.intro ? `<details class="tip card"><summary>💡 Ghi nhớ</summary><p>${esc(set.intro)}</p></details>` : ''}
      <div id="passage"></div>
      <div class="q-card card" id="q"></div>
      <div class="reveal" id="reveal" hidden></div>
    </section>`;
  const $ = (id) => el.querySelector('#' + id);
  const qEl = $('q'), revealEl = $('reveal'), passEl = $('passage');
  const renderMute = () => { $('mute').textContent = settings.sound ? '🔔' : '🔕'; };
  renderMute();
  let shownGroup = null;

  function renderProgress() {
    $('bar').style.width = `${(idx / queue.length) * 100}%`;
    $('count').textContent = `${idx + 1}/${queue.length}`;
  }

  function instrFor(it) {
    if (it.type === 'mcq' && it.prompt && !/_{3,}/.test(it.prompt) && !it.prompt.startsWith('"') && !it.group) return '';
    return it.instruction || it.group?.instruction || set.instruction || '';
  }

  // ---------- hiện từng câu ----------
  function showItem() {
    const it = queue[idx];
    done = false;
    revealEl.hidden = true;
    revealEl.classList.remove('open');
    renderProgress();
    // Đoạn văn của nhóm: chỉ vẽ lại khi sang nhóm khác.
    if (it.group?.id !== shownGroup) {
      shownGroup = it.group?.id || null;
      passEl.innerHTML = it.group ? `<details class="passage card" open><summary>📄 ${esc(it.group.title || 'Đọc đoạn văn')}</summary>${passageHTML(it.group.passage)}</details>` : '';
    }
    const instr = instrFor(it);
    const head = `${instr ? `<p class="q-instr muted small">${esc(instr)}</p>` : ''}${it.prompt ? `<p class="q-prompt">${rich(it.prompt)}</p>` : ''}${it.img ? `<img class="question-img" src="${imgUrl(subject?.exercises, it.img)}" alt="Hình minh hoạ câu hỏi">` : ''}`;
    cur = { it };

    if (it.type === 'mcq') {
      const sh = set.shuffle !== false && !it.noShuffle && canShuffle(it.options) ? shuffleOptions(it.options, it.answer) : { options: it.options, answer: it.answer };
      Object.assign(cur, sh);
      qEl.innerHTML = `${head}
        <div class="opts" role="list">
          ${cur.options.map((o, i) => `<button class="opt" data-i="${i}" role="listitem"><span class="opt-key">${'ABCD'[i]}</span><span class="opt-text">${rich(o)}</span></button>`).join('')}
        </div>
        ${isPhone() ? '' : '<p class="kbd-tip muted small">Mẹo: bấm phím 1–4 hoặc A–D để chọn</p>'}`;
    } else if (it.type === 'tf4') {
      cur.given = Array(4).fill(null);
      qEl.innerHTML = `${head}<div class="tf4">${it.statements.map((s, i) => `<div class="tf-row"><span>${rich(s)}</span><span><button class="btn btn-soft" data-tf="${i}" data-v="true">Đ</button><button class="btn btn-soft" data-tf="${i}" data-v="false">S</button></span></div>`).join('')}</div><button class="btn btn-primary" id="check" disabled>Kiểm tra</button>`;
      qEl.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.tf; cur.given[i] = b.dataset.v === 'true'; qEl.querySelectorAll(`[data-tf="${i}"]`).forEach((x) => x.classList.toggle('picked', x === b)); $('check').disabled = cur.given.some((x) => x === null); }));
      $('check').addEventListener('click', submitTf4);
    } else if (it.type === 'num') {
      cur.num = '';
      qEl.innerHTML = `${head}<div class="num-answer"><b id="ans" aria-label="Đáp án số"></b>${it.unit ? `<span class="muted"> ${rich(it.unit)}</span>` : ''}</div><div class="num-pad">${['1','2','3','4','5','6','7','8','9',',','0','-','⌫'].map((k) => `<button class="btn btn-soft" data-num="${k}">${k}</button>`).join('')}</div><button class="btn btn-primary" id="check" disabled>Kiểm tra</button>`;
      const renderNum = () => { $('ans').textContent = cur.num; $('check').disabled = !cur.num; };
      qEl.querySelectorAll('[data-num]').forEach((b) => b.addEventListener('click', () => { cur.num = numKey(cur.num, b.dataset.num); renderNum(); }));
      $('check').addEventListener('click', submitNum);
    } else if (it.type === 'card') {
      qEl.innerHTML = `<h2 class="section-title">${rich(it.title)}</h2>${(it.paras || []).map((p) => `<p>${rich(p)}</p>`).join('')}${it.table ? `<table>${it.table.map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</table>` : ''}<button class="btn btn-primary" id="check">Đã đọc</button>`;
      $('check').addEventListener('click', () => { done = true; next(); });
    } else if (it.type === 'input') {
      qEl.innerHTML = `${head}
        ${it.lead ? `<p class="q-lead">→ ${rich(it.lead)}</p>` : ''}
        <div class="input-row">
          <input id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Gõ đáp án…" aria-label="Đáp án">
          <button class="btn btn-primary" id="check">Kiểm tra</button>
        </div>`;
      const inp = $('ans');
      if (!isPhone()) inp.focus({ preventScroll: true });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitInput(); } });
      $('check').addEventListener('click', submitInput);
    } else if (it.type === 'order') {
      cur.order = shuffleParts(it.parts);
      cur.built = [];
      cur.vertical = (it.joiner || ' ') !== ' ';
      qEl.innerHTML = `${head}
        <div class="order-built ${cur.vertical ? 'vertical' : ''}" id="built" aria-label="Câu đang xếp"></div>
        <div class="order-pool ${cur.vertical ? 'vertical' : ''}" id="pool"></div>
        <div class="row"><button class="btn btn-soft" id="undo">⌫ Xoá</button><button class="btn btn-primary" id="check" disabled>Kiểm tra</button></div>`;
      renderOrder();
      $('pool').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && !done) { touch(); cur.built.push(+b.dataset.p); sfx.tick(); renderOrder(); } });
      $('built').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b && !done) { cur.built.splice(+b.dataset.k, 1); sfx.back(); renderOrder(); } });
      $('undo').addEventListener('click', () => { if (!done && cur.built.length) { cur.built.pop(); sfx.back(); renderOrder(); } });
      $('check').addEventListener('click', submitOrder);
    } else if (it.type === 'error') {
      cur.picked = -1;
      qEl.innerHTML = `${head}
        <p class="muted small">1) Bấm vào từ sai · 2) Gõ từ đúng</p>
        <div class="err-tokens" id="toks">${it.tokens.map((t, i) => `<button class="tok" data-t="${i}">${esc(t)}</button>`).join(' ')}</div>
        <div class="input-row">
          <input id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Sửa thành…" aria-label="Từ đúng" disabled>
          <button class="btn btn-primary" id="check" disabled>Kiểm tra</button>
        </div>`;
      $('toks').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (!b || done) return;
        touch();
        cur.picked = +b.dataset.t;
        qEl.querySelectorAll('.tok').forEach((x) => x.classList.toggle('picked', x === b));
        $('ans').disabled = false; $('check').disabled = false; $('ans').focus({ preventScroll: true });
      });
      $('ans').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitError(); } });
      $('check').addEventListener('click', submitError);
    } else if (it.type === 'writing') {
      qEl.innerHTML = `${head}
        <textarea id="essay" rows="6" placeholder="Viết bằng tiếng Anh…" aria-label="Bài viết"></textarea>
        <p class="muted small" id="wc">0 từ · cần khoảng ${it.minWords}–${it.maxWords} từ</p>
        <button class="btn btn-primary" id="check" disabled>Nộp bài</button>`;
      const ta = $('essay');
      ta.addEventListener('input', () => {
        const n = wordCount(ta.value);
        $('wc').textContent = `${n} từ · cần khoảng ${it.minWords}–${it.maxWords} từ`;
        $('check').disabled = n < Math.ceil(it.minWords * 0.6);
      });
      $('check').addEventListener('click', submitWriting);
    } else {
      // Kiểu chưa hỗ trợ: bỏ qua an toàn.
      idx++;
      return idx < queue.length ? showItem() : finish(false);
    }
  }

  function renderOrder() {
    const it = cur.it;
    const used = new Set(cur.built);
    $('built').innerHTML = cur.built.length
      ? cur.built.map((p, k) => `<button class="chip-part on" data-k="${k}">${rich(it.parts[p])}</button>`).join('')
      : '<span class="muted small">Bấm các mảnh bên dưới theo đúng thứ tự…</span>';
    if (cur.built.length && it.end) $('built').insertAdjacentHTML('beforeend', `<span class="order-end">${esc(it.end)}</span>`);
    $('pool').innerHTML = cur.order.map((p) => `<button class="chip-part" data-p="${p}" ${used.has(p) ? 'hidden' : ''}>${rich(it.parts[p])}</button>`).join('');
    $('check').disabled = cur.built.length !== it.parts.length;
  }

  // ---------- chấm ----------
  function answerMcq(i) {
    if (done) return;
    touch();
    const ok = i === cur.answer;
    qEl.querySelectorAll('.opt').forEach((b, j) => {
      b.disabled = true;
      if (j === cur.answer) b.classList.add('right');
      if (j === i && !ok) b.classList.add('wrong');
    });
    record(ok, cur.options[i]);
  }

  function submitInput() {
    if (done) return;
    const inp = $('ans');
    if (!inp.value.trim()) { inp.focus(); return; }
    touch();
    const ok = checkInput(inp.value, cur.it.answers, cur.it.lead);
    inp.disabled = true;
    inp.classList.add(ok ? 'right' : 'wrong');
    $('check').disabled = true;
    record(ok, inp.value);
  }

  function submitNum() {
    if (done || !cur.num) return;
    touch();
    const r = checkNum(cur.num, cur.it.answer, cur.it.round, cur.it.tolerance, cur.it.exact);
    $('check').disabled = true;
    record(r.ok, cur.num, false, r.why);
  }

  function submitTf4() {
    if (done || cur.given.some((x) => x === null)) return;
    touch();
    qEl.querySelectorAll('[data-tf]').forEach((b) => { b.disabled = true; const i = +b.dataset.tf; if ((b.dataset.v === 'true') === cur.it.answers[i]) b.classList.add('right'); });
    $('check').disabled = true;
    const r = checkTf4(cur.given, cur.it.answers);
    record(r.ok, tf4Text(cur.given), false, r.right);
  }

  function submitOrder() {
    if (done || cur.built.length !== cur.it.parts.length) return;
    touch();
    const given = cur.built.map((p) => cur.it.parts[p]);
    const ok = checkOrder(given, cur.it.parts, cur.it.alts || []);
    $('built').classList.add(ok ? 'right' : 'wrong');
    $('check').disabled = true; $('undo').disabled = true;
    record(ok, given.join(cur.vertical ? ' / ' : ' '));
  }

  function submitError() {
    if (done || cur.picked < 0) return;
    const inp = $('ans');
    if (!inp.value.trim()) { inp.focus(); return; }
    touch();
    const it = cur.it;
    const ok = checkError(cur.picked, inp.value, it.wrong, it.answers);
    qEl.querySelectorAll('.tok').forEach((x, i) => { x.disabled = true; if (i === it.wrong) x.classList.add('right'); else if (i === cur.picked) x.classList.add('wrong'); });
    inp.disabled = true; $('check').disabled = true;
    inp.classList.add(ok ? 'right' : 'wrong');
    record(ok, `${it.tokens[cur.picked]} → ${inp.value}`);
  }

  // Viết đoạn: con tự chấm theo danh sách kiểm tra, xem bài mẫu. Bài viết lưu về Sheet cho bố đọc.
  function submitWriting() {
    if (done) return;
    touch();
    const it = cur.it;
    const text = $('essay').value.trim();
    cur.pendingWriting = text;   // thoát trước khi bấm "Xong" thì vẫn lưu bài viết
    $('essay').disabled = true; $('check').hidden = true;
    const box = document.createElement('div');
    box.className = 'self-check';
    box.innerHTML = `
      <p class="section-title">Tự kiểm tra bài của mình:</p>
      ${it.checklist.map((c, i) => `<label class="check-row"><input type="checkbox" data-c="${i}"> ${esc(c)}</label>`).join('')}
      <details class="sample"><summary>📘 Xem bài mẫu</summary><p>${esc(it.sample)}</p></details>
      <button class="btn btn-primary" id="selfdone">Xong</button>`;
    qEl.appendChild(box);
    box.querySelector('#selfdone').addEventListener('click', () => {
      const n = box.querySelectorAll('input:checked').length;
      const ok = n >= Math.ceil(it.checklist.length * 0.7);
      box.querySelectorAll('input').forEach((x) => { x.disabled = true; });
      box.querySelector('#selfdone').hidden = true;
      cur.pendingWriting = null;
      record(ok, text, true);
    }, { once: true });
  }

  function record(ok, given, isWriting = false, detail) {
    done = true;
    const it = cur.it;
    if (ok) sfx.correct(); else { sfx.wrong(); if (navigator.vibrate) navigator.vibrate(80); }
    attempts.push({ sessionId, wordId: it.id, correct: ok, usedHint: false, tries: 1, revealed: false, ms: 0, at: Date.now(), given: String(given).slice(0, isWriting ? 2000 : 120), kind: it.type });
    const now = Date.now();
    const prevAt = st.progress[it.id]?.lastAt || 0;
    st.progress[it.id] = review(st.progress[it.id], { correct: ok, usedHint: false }, now);
    if (isCap) {
      // pull có thể thay settings giữa lượt; luôn ghi vào cap mới nhất của hồ sơ.
      cap = st.settings.cap || cap;
      st.settings.cap = cap;
      const { up } = recordAnswer(cap, topic, it, ok, now, prevAt, cfg);
      if (up) highestUp = Math.max(highestUp || 0, up);
    }
    if (isPlace) placementResults.push({ level: it.level, ok });
    store.countWord();
    store.save();
    showReveal(ok, detail);
  }

  function correctText() {
    // Trắc nghiệm: phương án đúng theo thứ tự đã trộn; các kiểu khác dùng chung answerText.
    return cur.it.type === 'mcq' ? plain(cur.options[cur.answer]) : answerText(cur.it);
  }

  function showReveal(ok, detail) {
    const it = cur.it;
    const words = mod.id === 'phonics' ? cur.options.map(plain) : [];
    const writing = it.type === 'writing';
    revealEl.innerHTML = `
      <div class="reveal-head ${ok ? 'ok' : 'retry'}">${writing ? (ok ? '🎉 Bài viết tốt lắm!' : '📌 Lần sau thử đủ các ý nhé') : ok ? '🎉 ' + pick(LINES.correct) : '📌 Chưa đúng, nhớ câu này nhé'}</div>
      ${ok || writing ? '' : `<p class="reveal-vi">Đáp án: <b>${esc(correctText())}</b></p>`}
      ${it.type === 'tf4' ? `<ul class="plain reveal-ex">${it.explain.map((x, i) => `<li>${rich(x)}</li>`).join('')}</ul>` : it.explain ? `<p class="reveal-ex">${rich(it.explain)}</p>` : ''}
      ${detail === 'round' ? '<p class="reveal-vi">Đúng hướng, nhưng làm tròn chưa đúng yêu cầu</p>' : typeof detail === 'number' ? `<p class="reveal-vi">Đúng ${detail}/4 ý</p>` : ''}
      ${words.length ? `<div class="family">${words.map((w) => `<button class="chip-btn say" data-say="${esc(w)}">🔊 ${esc(w)}</button>`).join('')}</div>` : ''}
      ${writing ? '<p class="muted small">Bài viết đã được lưu để bố mẹ đọc.</p>' : ''}
      <button class="btn btn-primary btn-lg" id="next">Tiếp →</button>`;
    revealEl.hidden = false;
    requestAnimationFrame(() => revealEl.classList.add('open'));
    // Ngữ âm: đáp án soạn theo giọng Anh-Anh, nên luôn đọc giọng Anh để con nghe khớp đáp án.
    revealEl.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.say, mod.id === 'phonics' ? 'uk' : settings.voice)));
    revealEl.querySelector('#next').addEventListener('click', next);
    revealEl.querySelector('#next').focus({ preventScroll: true });
  }

  function next() {
    if (!done) return;
    idx++;
    if (idx >= queue.length) return finish(false);
    showItem();
  }

  function finish(partial) {
    if (finished) return;
    finished = true;
    touch();
    saveLastBy(Date.now());
    if (cur?.pendingWriting) {
      // Đã nộp bài viết nhưng chưa tự chấm: lưu bài, tính là chưa đạt để lần sau ôn lại.
      const it = cur.it;
      attempts.push({ sessionId, wordId: it.id, correct: false, usedHint: false, tries: 1, revealed: false, ms: 0, at: Date.now(), given: cur.pendingWriting.slice(0, 2000), kind: 'writing' });
      st.progress[it.id] = review(st.progress[it.id], { correct: false, usedHint: false }, Date.now());
      cur.pendingWriting = null;
      store.save();
    }
    if (!attempts.length) {
      if (!partial) { toast('Đã đọc xong'); go(`#/ex?m=${mod.id}`); }
      return;
    }
    if (isPlace && !partial) {
      cap = st.settings.cap || cap;
      st.settings.cap = cap;
      applyPlacement(cap, topic, placementLevel(placementResults, cfg), Date.now());
    }
    if (isCap || isPlace) store.enqueue('settings', { cap: st.settings.cap || cap });
    const session = {
      sessionId, startedAt, endedAt: Date.now(),
      activeSeconds: Math.round(activeMs / 1000),
      module: mod.id, unitId: set.id, difficulty: '-',
      total: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      hintsUsed: 0,
      wrongIds: attempts.filter((a) => !a.correct).map((a) => a.wordId),
      partial, device: isPhone() ? 'phone' : 'laptop',
    };
    store.recordSession(session, attempts);
    if (!partial) go(`#/ex-result?m=${mod.id}&sid=${sessionId}${highestUp ? `&up=${highestUp}` : ''}`);
  }

  // ---------- sự kiện ----------
  qEl.addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (b && !b.disabled) answerMcq(+b.dataset.i);
  });
  $('mute').addEventListener('click', () => { store.setSetting('sound', !settings.sound); setEnabled(settings.sound); renderMute(); });
  // Có bài viết đã nộp mà chưa tự chấm cũng tính là đã làm (để không mất bài).
  const hasWork = () => attempts.length > 0 || !!cur?.pendingWriting;
  $('quit').addEventListener('click', () => {
    if (!hasWork()) return go(`#/ex?m=${mod.id}`);
    sheet(`
      <div class="sheet-handle"></div>
      <div class="center"><div class="mascot">${mascotSVG('sad')}</div><h3>Dừng bài này hả?</h3>
      <p class="muted">Các câu đã làm (${attempts.length + (cur?.pendingWriting ? 1 : 0)}) vẫn được lưu lại.</p></div>
      <div class="row"><button class="btn btn-soft" data-a="stay">Làm tiếp</button><button class="btn btn-primary" data-a="quit">Dừng</button></div>`,
    (box, close) => box.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      close();
      if (a === 'quit') { finish(true); go(`#/ex?m=${mod.id}`); }
    }));
  });
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.sheet-wrap')) return;
    if (e.target.closest('input, textarea') && e.key !== 'Enter') return;
    if (e.target.closest('textarea')) return; // Enter trong bài viết là xuống dòng
    touch();
    if (e.key === 'Enter' && done) {
      // Giữ phím Enter không lướt qua nhiều câu (chặn cả việc trình duyệt tự bấm nút đang focus).
      if (e.repeat) { e.preventDefault(); return; }
      const btn = e.target.closest('button');
      if (btn && btn.id !== 'next') return;
      e.preventDefault(); next(); return;
    }
    if (!done && cur?.it.type === 'mcq') {
      const k = e.key.toUpperCase();
      const i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'ABCD'.indexOf(k);
      if (i >= 0 && i < cur.options.length) answerMcq(i);
    }
  };
  document.addEventListener('keydown', onKey);
  const onHide = () => { if (!finished && hasWork()) finish(true); };
  window.addEventListener('pagehide', onHide);

  showItem();

  return () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', onHide);
    window.speechSynthesis?.cancel();
    if (!finished && hasWork()) finish(true);
  };
}

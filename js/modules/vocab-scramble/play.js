import * as store from '../../core/store.js';
import { findUnit, getUnitWords, getAllWords, exampleParts } from '../../core/data.js';
import { diffFor, pickWords, review, isDue, allowedPriorities } from '../../core/srs.js';
import { sfx, setEnabled } from '../../core/sound.js';
import { speak } from '../../core/speech.js';
import { mascotSVG, LINES, pick } from '../../ui/mascot.js';
import { esc, go, toast, sheet, isPhone } from '../../ui/dom.js';

const isLetter = (c) => /[a-z0-9]/i.test(c);
const IDLE_MS = 60_000;

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function buildList(params, settings, progress) {
  const size = settings.sessionSize;
  if (params.unit === 'review') {
    const prios = allowedPriorities(settings.extended);
    const now = Date.now();
    const due = (await getAllWords())
      .filter((w) => prios.includes(w.priority ?? 2) && isDue(progress[w.id], now))
      .sort((a, b) => progress[a.id].dueAt - progress[b.id].dueAt)
      .slice(0, size);
    return shuffle(due);
  }
  return pickWords(await getUnitWords(params.unit), progress, {
    size, difficulty: params.d, extended: settings.extended,
  });
}

export async function mount(el, params, { isCurrent = () => true } = {}) {
  const st = store.get();
  const settings = st.settings;
  const D = diffFor(st.track, params.d);
  const difficulty = D.key;
  const isReview = params.unit === 'review';
  const unit = isReview ? null : await findUnit(params.unit);
  if (!isCurrent()) return;
  if (!isReview && !unit?.file) { go('#/topics'); return; }

  const list = await buildList({ ...params, d: difficulty }, settings, st.progress);
  // Người dùng đã bấm sang màn khác trong lúc đang tải: không dựng lượt, không chuyển màn.
  if (!isCurrent()) return;
  if (!list.length) {
    toast(isReview ? 'Chưa có từ nào cần ôn ✨' : 'Chủ đề này chưa có từ');
    go(isReview ? '#/home' : '#/topics');
    return;
  }

  // ---------- trạng thái lượt ----------
  const sessionId = newId();
  const startedAt = Date.now();
  let activeMs = 0;
  let lastAct = Date.now();
  const touch = () => { const n = Date.now(); if (n - lastAct < IDLE_MS) activeMs += n - lastAct; lastAct = n; };

  const queue = list.map((w) => ({ w, retry: false }));
  const firstTotal = queue.length;
  const attempts = [];          // lần làm đầu tiên của mỗi từ
  let idx = 0;
  let finished = false;

  // ---------- trạng thái từng từ ----------
  let w, answer, letters, tiles, order, placed, locked, tileSlot, shown, usedHint, wrongTries, revealed, done, wordStart;

  el.innerHTML = `
    <section class="screen play">
      <header class="play-top">
        <button class="icon-btn" id="quit" aria-label="Dừng lượt">✕</button>
        <div class="bar" aria-hidden="true"><div class="bar-fill" id="bar"></div></div>
        <span class="count" id="count"></span>
        <button class="icon-btn" id="mute" aria-label="Bật/tắt âm thanh"></button>
      </header>
      <div class="play-meta muted small">${isReview ? '🔁 Ôn từ đến hạn' : `${unit.emoji} Unit ${unit.no} · ${esc(unit.title)}`} · ${D.emoji} ${D.label}</div>
      <div class="clue-card">
        <div class="mascot mini" id="mini"></div>
        <div id="clues" class="clues"></div>
      </div>
      <div class="slots" id="slots" aria-label="Ô xếp chữ"></div>
      <div class="tiles" id="tiles" aria-label="Chữ cái"></div>
      <div class="actions">
        <button class="btn btn-soft" id="hint">💡 Gợi ý</button>
        <button class="btn btn-soft" id="undo">⌫ Xoá</button>
        <button class="btn btn-soft" id="shuffle">🔀 Trộn</button>
        <button class="btn btn-soft" id="giveup">🏳️ Bỏ qua</button>
      </div>
      ${isPhone() ? '' : '<p class="kbd-tip muted small">Mẹo: gõ phím chữ cái để xếp · Backspace để xoá · Enter để tiếp</p>'}
      <div class="reveal" id="reveal" hidden></div>
    </section>`;

  const $ = (id) => el.querySelector('#' + id);
  const slotsEl = $('slots'), tilesEl = $('tiles'), cluesEl = $('clues'), miniEl = $('mini'), revealEl = $('reveal');

  const setMood = (m) => { miniEl.innerHTML = mascotSVG(m); };
  const renderMute = () => { $('mute').textContent = settings.sound ? '🔔' : '🔕'; };
  renderMute();

  // ---------- dựng một từ ----------
  function startWord() {
    const item = queue[idx];
    w = item.w;
    answer = w.word.toLowerCase();
    letters = [...answer].filter(isLetter);
    const decoyPool = 'aeioulnrst'.split('');
    const decoys = Array.from({ length: D.decoys }, () => decoyPool[Math.floor(Math.random() * decoyPool.length)]);
    tiles = [...letters, ...decoys];
    // Trộn sao cho thứ tự khác đáp án.
    do { order = shuffle(tiles.map((_, i) => i)); } while (tiles.length > 2 && order.slice(0, letters.length).map((i) => tiles[i]).join('') === letters.join(''));
    placed = Array(letters.length).fill(null);
    locked = new Set();
    tileSlot = Array(tiles.length).fill(-1);
    shown = D.start.filter(hasClue);
    if (!shown.length) shown = ['vi'];
    usedHint = false;
    wrongTries = 0;
    revealed = false;
    done = false;
    wordStart = Date.now();
    if (D.prefill) for (let k = 0; k < Math.min(D.prefill, letters.length - 1); k++) lockCorrect(k);

    revealEl.hidden = true;
    revealEl.classList.remove('open');
    $('giveup').textContent = '🏳️ Bỏ qua';
    $('giveup').classList.remove('pulse');
    setMood(item.retry ? 'think' : 'idle');
    renderProgress();
    renderClues();
    renderSlots();
    renderTiles();
  }

  function hasClue(c) {
    if (c === 'audio') return 'speechSynthesis' in window;
    return !!w[c];
  }

  function renderProgress() {
    $('bar').style.width = `${(Math.min(idx, firstTotal) / firstTotal) * 100}%`;
    $('count').textContent = queue[idx]?.retry ? 'Ôn lại' : `${Math.min(idx + 1, firstTotal)}/${firstTotal}`;
  }

  function clueHTML(c) {
    if (c === 'pic') return `<div class="clue clue-pic" aria-hidden="true">${esc(w.pic)}</div>`;
    if (c === 'audio') return `<div class="clue"><span class="clue-label">Nghe từ</span><p class="clue-main"><button class="btn btn-soft listen" data-listen>🔊 Nghe lại</button></p></div>`;
    if (c === 'vi') return `<div class="clue"><span class="clue-label">Nghĩa tiếng Việt</span><p class="clue-main">${esc(w.vi)}</p></div>`;
    if (c === 'defEn') return `<div class="clue"><span class="clue-label">English meaning</span><p class="clue-main en">${esc(w.defEn)}</p></div>`;
    const ex = esc(w.example).replace('______', '<span class="blank">?</span>');
    return `<div class="clue"><span class="clue-label">Điền vào chỗ trống</span><p class="clue-main en">${ex}</p></div>`;
  }

  function renderClues() {
    const n = letters.length;
    const words = answer.split(' ').length;
    cluesEl.innerHTML = `
      <div class="clue-tags"><span class="chip">${esc(w.pos)}</span><span class="chip">${n} chữ cái${words > 1 ? ` · ${words} từ` : ''}</span>${queue[idx].retry ? '<span class="chip warn">làm lại</span>' : ''}</div>
      ${shown.map(clueHTML).join('')}`;
  }

  function slotSize() {
    const groups = answer.split(/[\s]/).map((g) => [...g].filter(isLetter).length);
    const widest = Math.max(...groups);
    const avail = Math.min(el.clientWidth || 360, 560) - 32;
    const gap = 4;
    return Math.max(18, Math.min(48, Math.floor((avail - gap * (widest - 1)) / widest)));
  }

  function renderSlots() {
    let k = 0;
    let html = '<span class="slot-group">';
    for (const ch of answer) {
      if (ch === ' ') { html += '</span><span class="slot-group">'; continue; }
      if (!isLetter(ch)) { html += `<span class="sep">${esc(ch)}</span>`; continue; }
      const j = placed[k];
      const cls = ['slot', j !== null ? 'filled' : '', locked.has(k) ? 'locked' : ''].join(' ');
      const label = j !== null ? `Ô ${k + 1}: ${tiles[j].toUpperCase()}${locked.has(k) ? '' : ', bấm để gỡ'}` : `Ô ${k + 1}: trống`;
      html += `<button class="${cls}" data-slot="${k}" aria-label="${label}" ${j === null || locked.has(k) || done ? 'tabindex="-1"' : ''}>${j !== null ? esc(tiles[j]) : ''}</button>`;
      k++;
    }
    html += '</span>';
    slotsEl.style.setProperty('--slot', `${slotSize()}px`);
    slotsEl.innerHTML = html;
  }

  function renderTiles() {
    tilesEl.innerHTML = order.map((j) =>
      `<button class="tile ${tileSlot[j] >= 0 ? 'used' : ''}" data-tile="${j}" ${tileSlot[j] >= 0 || done ? 'tabindex="-1"' : ''}>${esc(tiles[j])}</button>`).join('');
  }

  // ---------- thao tác ----------
  function firstEmpty() { return placed.findIndex((p) => p === null); }

  function placeTile(j, target) {
    if (done || tileSlot[j] >= 0) return;
    let k = target;
    if (k === undefined || k < 0 || placed[k] !== null || locked.has(k)) k = firstEmpty();
    if (k < 0) return;
    placed[k] = j;
    tileSlot[j] = k;
    sfx.tick();
    renderSlots();
    renderTiles();
    const s = slotsEl.querySelector(`[data-slot="${k}"]`);
    s?.classList.add('pop');
    if (firstEmpty() < 0) check();
  }

  function returnTile(k) {
    if (done || locked.has(k) || placed[k] === null) return;
    const j = placed[k];
    placed[k] = null;
    tileSlot[j] = -1;
    sfx.back();
    renderSlots();
    renderTiles();
  }

  function undo() {
    for (let k = placed.length - 1; k >= 0; k--) {
      if (placed[k] !== null && !locked.has(k)) { returnTile(k); return; }
    }
  }

  function lockCorrect(k) {
    const need = letters[k];
    if (placed[k] !== null && tiles[placed[k]] === need) { locked.add(k); return; }
    if (placed[k] !== null) { tileSlot[placed[k]] = -1; placed[k] = null; }
    let j = tiles.findIndex((t, i) => t === need && tileSlot[i] < 0);
    if (j < 0) {
      // Chữ cần dùng đang nằm sai chỗ khác: lấy về.
      // Ưu tiên lấy từ ô đang đặt sai, không lấy chữ khỏi ô đang đúng.
      let m = placed.findIndex((pj, i) => pj !== null && !locked.has(i) && tiles[pj] === need && tiles[pj] !== letters[i]);
      if (m < 0) m = placed.findIndex((pj, i) => pj !== null && !locked.has(i) && tiles[pj] === need);
      j = placed[m];
      placed[m] = null;
      tileSlot[j] = -1;
    }
    placed[k] = j;
    tileSlot[j] = k;
    locked.add(k);
  }

  function hint() {
    if (done) return;
    usedHint = true;
    sfx.hint();
    const next = D.more.find((c) => !shown.includes(c) && hasClue(c));
    if (next) {
      shown.push(next);
      renderClues();
      if (next === 'audio') speak(w.word, settings.voice, 0.8);
      return;
    }
    // Sửa ô đặt sai trước, rồi mới lấp ô trống.
    let k = placed.findIndex((pj, i) => !locked.has(i) && pj !== null && tiles[pj] !== letters[i]);
    if (k < 0) k = placed.findIndex((pj, i) => !locked.has(i) && pj === null);
    if (k < 0) return;
    lockCorrect(k);
    renderSlots();
    renderTiles();
    if (firstEmpty() < 0) check({ fromHint: true });
  }

  function check({ fromHint = false } = {}) {
    const guess = placed.map((j) => tiles[j]).join('');
    const targets = [answer, ...(w.variants || [])].map((t) => [...t.toLowerCase()].filter(isLetter).join(''));
    if (targets.includes(guess)) return win();
    if (fromHint) {
      // Ô kín vì gợi ý vừa lấp: chưa phải lần trả lời của con, chỉ chỉ ra chữ còn sai.
      placed.forEach((j, k) => {
        if (j !== null && tiles[j] !== letters[k]) slotsEl.querySelector(`[data-slot="${k}"]`)?.classList.add('bad');
      });
      return;
    }
    wrongTries++;
    sfx.wrong();
    setMood('sad');
    toast(pick(LINES.wrong));
    slotsEl.classList.remove('shake');
    void slotsEl.offsetWidth;
    slotsEl.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(80);
    // Mức Dễ: chỉ ra chữ đặt sai.
    if (difficulty === 'easy') {
      placed.forEach((j, k) => {
        if (j !== null && tiles[j] !== letters[k]) slotsEl.querySelector(`[data-slot="${k}"]`)?.classList.add('bad');
      });
    }
    if (wrongTries >= 2) {
      $('giveup').textContent = '👀 Xem đáp án';
      $('giveup').classList.add('pulse');
    }
  }

  function win() {
    done = true;
    sfx.correct();
    setMood('happy');
    slotsEl.classList.add('win');
    setTimeout(() => slotsEl.classList.remove('win'), 700);
    finishWord();
  }

  function giveUp() {
    if (done) return;
    revealed = true;
    done = true;
    for (let k = 0; k < letters.length; k++) if (!locked.has(k)) lockCorrect(k);
    sfx.wrong();
    setMood('think');
    renderSlots();
    renderTiles();
    finishWord();
  }

  function finishWord() {
    const item = queue[idx];
    const correct = wrongTries === 0 && !revealed;
    if (!item.retry) {
      attempts.push({ sessionId, wordId: w.id, correct, usedHint, tries: wrongTries + 1, revealed, ms: Date.now() - wordStart, at: Date.now() });
      st.progress[w.id] = review(st.progress[w.id], { correct, usedHint }, Date.now());
      store.countWord();
      if (!correct) queue.push({ w, retry: true });
    }
    store.save();
    renderSlots();
    renderTiles();
    speak(w.word, settings.voice);
    showReveal(correct);
  }

  function showReveal(correct) {
    const fam = [...(w.family || []), ...(w.collocations || [])];
    let ex = '';
    if (w.example) { const p = exampleParts(w); ex = `${esc(p.before)}<b>${esc(p.filled)}</b>${esc(p.after)}`; }
    revealEl.innerHTML = `
      <div class="reveal-head ${correct ? 'ok' : 'retry'}">${correct ? (usedHint ? '👍 Đúng rồi (có dùng gợi ý)' : '🎉 ' + pick(LINES.correct)) : '📌 Từ này sẽ được ôn lại'}</div>
      <div class="reveal-word">
        ${w.pic ? `<span class="reveal-pic" aria-hidden="true">${esc(w.pic)}</span>` : ''}
        <span class="word">${esc(w.word)}</span>
        <button class="icon-btn speak" id="say" aria-label="Nghe phát âm">🔊</button>
      </div>
      <div class="muted">${esc(w.ipa || '')} · <i>${esc(w.pos)}</i></div>
      <p class="reveal-vi">${esc(w.vi)}</p>
      ${ex ? `<p class="reveal-ex en">“${ex}”</p>` : ''}
      ${fam.length ? `<div class="family">${fam.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
      <button class="btn btn-primary btn-lg" id="next">Tiếp →</button>`;
    revealEl.hidden = false;
    requestAnimationFrame(() => revealEl.classList.add('open'));
    revealEl.querySelector('#say').addEventListener('click', () => speak(w.word, settings.voice));
    revealEl.querySelector('#next').addEventListener('click', next);
    revealEl.querySelector('#next').focus({ preventScroll: true });
  }

  function next() {
    if (!done) return;
    idx++;
    if (idx >= queue.length) return finish(false);
    startWord();
  }

  function finish(partial) {
    if (finished) return;
    finished = true;
    touch();
    if (!attempts.length) return;
    const session = {
      sessionId,
      startedAt,
      endedAt: Date.now(),
      activeSeconds: Math.round(activeMs / 1000),
      module: 'vocab-scramble',
      unitId: isReview ? 'review' : unit.id,
      difficulty,
      total: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      hintsUsed: attempts.filter((a) => a.usedHint).length,
      wrongIds: attempts.filter((a) => !a.correct).map((a) => a.wordId),
      partial,
      device: isPhone() ? 'phone' : 'laptop',
    };
    store.recordSession(session, attempts);
    if (!partial) go(`#/result?sid=${sessionId}`);
  }

  // ---------- kéo thả + bấm ----------
  let drag = null;
  tilesEl.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tile');
    if (!t || t.classList.contains('used') || done) return;
    touch();
    drag = { j: +t.dataset.tile, el: t, x: e.clientX, y: e.clientY, moving: false, ghost: null };
    t.setPointerCapture(e.pointerId);
  });
  tilesEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) > 8) {
      drag.moving = true;
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost');
      document.body.appendChild(drag.ghost);
      drag.el.classList.add('lifting');
    }
    if (drag.moving) {
      drag.ghost.style.left = `${e.clientX}px`;
      drag.ghost.style.top = `${e.clientY}px`;
      slotsEl.querySelectorAll('.slot.hover').forEach((s) => s.classList.remove('hover'));
      document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot:not(.filled)')?.classList.add('hover');
    }
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moving) return placeTile(d.j);
    d.ghost.remove();
    d.el.classList.remove('lifting');
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slot = target?.closest('.slot');
    if (slot) placeTile(d.j, +slot.dataset.slot);
    else if (target?.closest('.slots')) placeTile(d.j);
    else slotsEl.querySelectorAll('.slot.hover').forEach((s) => s.classList.remove('hover'));
  };
  tilesEl.addEventListener('pointerup', endDrag);
  // Bàn phím (Tab + Enter/Space) tạo click không có pointer.
  tilesEl.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t && e.detail === 0) placeTile(+t.dataset.tile);
  });
  tilesEl.addEventListener('pointercancel', (e) => { if (drag?.ghost) drag.ghost.remove(); drag?.el.classList.remove('lifting'); drag = null; });

  cluesEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-listen]')) { touch(); speak(w.word, settings.voice, 0.8); }
  });
  slotsEl.addEventListener('click', (e) => {
    const s = e.target.closest('.slot');
    if (s) { touch(); returnTile(+s.dataset.slot); }
  });

  $('hint').addEventListener('click', () => { touch(); hint(); });
  $('undo').addEventListener('click', () => { touch(); undo(); });
  $('shuffle').addEventListener('click', () => { touch(); order = shuffle(order); renderTiles(); sfx.back(); });
  $('giveup').addEventListener('click', () => { touch(); giveUp(); });
  $('mute').addEventListener('click', () => {
    store.setSetting('sound', !settings.sound);
    setEnabled(settings.sound);
    renderMute();
  });
  $('quit').addEventListener('click', () => {
    if (!attempts.length) return go('#/home');
    sheet(`
      <div class="sheet-handle"></div>
      <div class="center"><div class="mascot">${mascotSVG('sad')}</div>
      <h3>Dừng lượt này hả?</h3>
      <p class="muted">Các từ đã làm (${attempts.length}) vẫn được lưu lại.</p></div>
      <div class="row">
        <button class="btn btn-soft" data-a="stay">Học tiếp</button>
        <button class="btn btn-primary" data-a="quit">Dừng</button>
      </div>`, (box, close) => {
      box.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        close();
        if (a === 'quit') { finish(true); go('#/home'); }
      });
    });
  });

  const onKey = (e) => {
    if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.sheet-wrap')) return; // đang mở hộp "Dừng lượt
    touch();
    if (e.key === 'Enter') { if (done) { e.preventDefault(); next(); } return; }
    if (done) return;
    if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
    if (e.key.length === 1 && isLetter(e.key)) {
      const ch = e.key.toLowerCase();
      const j = order.find((i) => tiles[i] === ch && tileSlot[i] < 0);
      if (j !== undefined) placeTile(j);
    }
  };
  document.addEventListener('keydown', onKey);

  startWord();

  // Tắt app hoặc đóng tab giữa lượt: vẫn ghi lại phần đã học (thời gian, chuỗi ngày).
  const onHide = () => { if (!finished && attempts.length) finish(true); };
  window.addEventListener('pagehide', onHide);

  return () => {
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('keydown', onKey);
    window.speechSynthesis?.cancel();
    if (!finished && attempts.length) finish(true);
  };
}

// Tạo hồ sơ người học mới: chọn lộ trình (cấp 3 / cấp 1) + tên.
import * as store from '../core/store.js';
import { getTracks } from '../core/data.js';
import { mascotSVG } from '../ui/mascot.js';
import { esc, go, toast } from '../ui/dom.js';

export async function mount(el) {
  const tracks = await getTracks();
  const hasProfiles = store.profiles().length > 0;
  let chosen = null;

  el.innerHTML = `
    <section class="screen welcome">
      ${hasProfiles ? '<header class="topbar"><a class="icon-btn" href="#/profiles" aria-label="Quay lại">←</a><span></span><span class="icon-btn ghost"></span></header>' : ''}
      <div class="mascot big bob">${mascotSVG('wow')}</div>
      <h1 class="title-xl">Chào bạn! Mình là <span class="hl">Mít</span> 👋</h1>
      <p class="muted">Bạn đang ôn thi gì nè?</p>
      <div class="track-list">
        ${tracks.map((t) => `
          <button class="track" data-track="${t.id}">
            <span class="track-emoji">${t.emoji}</span>
            <span class="track-text"><b>${esc(t.title)}</b><span class="muted small">${esc(t.desc)}</span></span>
            <span class="track-tag">${esc(t.short)}</span>
          </button>`).join('')}
      </div>
      <label class="field">
        <span>Mình gọi bạn là gì nhỉ?</span>
        <input id="name" type="text" maxlength="20" placeholder="Tên của bạn" autocomplete="given-name">
      </label>
      <button class="btn btn-primary btn-lg" id="go">Bắt đầu thôi 🚀</button>
    </section>`;

  el.querySelector('.track-list').addEventListener('click', (e) => {
    const b = e.target.closest('.track');
    if (!b) return;
    chosen = b.dataset.track;
    el.querySelectorAll('.track').forEach((x) => x.classList.toggle('active', x === b));
    el.querySelector('#name').focus();
  });

  const input = el.querySelector('#name');
  const start = () => {
    if (!chosen) { toast('Chọn lộ trình ôn thi trước nha 👆'); return; }
    const t = tracks.find((x) => x.id === chosen);
    store.createProfile({ name: input.value.trim() || 'bạn', track: chosen, palette: t.defaultPalette });
    go('#/home');
  };
  el.querySelector('#go').addEventListener('click', start);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
}

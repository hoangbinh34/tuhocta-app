// "Ai đang học?": chọn hồ sơ người học, hoặc thêm người học mới.
import * as store from '../core/store.js';
import { getTracks } from '../core/data.js';
import { clearSubject } from '../core/subject.js';
import { mascotSVG } from '../ui/mascot.js';
import { esc, go } from '../ui/dom.js';

export async function mount(el) {
  const tracks = await getTracks();
  const list = store.profiles();
  el.innerHTML = `
    <section class="screen profiles">
      <div class="mascot big bob">${mascotSVG('happy')}</div>
      <h1 class="title-xl center">Ai đang học nè? 👀</h1>
      <div class="profile-list">
        ${list.map((p) => {
          const t = tracks.find((x) => x.id === p.track);
          return `
          <button class="profile" data-id="${p.id}" data-palette="${p.settings.palette}">
            <span class="avatar">${esc((p.settings.name || '?').trim().charAt(0).toUpperCase())}</span>
            <span class="profile-text"><b>${esc(p.settings.name)}</b><span class="muted small">${t ? `${t.emoji} ${esc(t.title)}` : ''}</span></span>
            <span class="profile-streak">🔥 ${store.streak(p)}</span>
          </button>`;
        }).join('')}
        <a class="profile add" href="#/welcome"><span class="avatar">＋</span><span class="profile-text"><b>Thêm người học</b></span></a>
      </div>
      <a class="link center" href="#/parent">👨‍👩‍👧 Trang phụ huynh</a>
    </section>`;
  el.querySelector('.profile-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    // Chọn lại hồ sơ thì quên môn đã nhớ: lộ trình có từ 2 môn mở sẽ hỏi chọn môn một lần.
    clearSubject(b.dataset.id);
    store.switchProfile(b.dataset.id);
    go('#/home');
  });
}

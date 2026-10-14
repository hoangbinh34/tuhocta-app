import * as store from '../core/store.js';
import { setEnabled } from '../core/sound.js';
import { speak, hasAccent } from '../core/speech.js';
import { applyTheme } from '../main.js';
import { esc, toast, go } from '../ui/dom.js';
import { hasServer, token } from '../core/api.js';
import { syncNow } from '../core/sync.js';

const PALETTES = [
  { id: 'mint', name: 'Mint-Lavender', a: '#7C5CFF', b: '#22C3A0' },
  { id: 'peach', name: 'Đào', a: '#FF6F61', b: '#FFB13D' },
  { id: 'ocean', name: 'Biển', a: '#2F7BFF', b: '#00C2D1' },
];

function seg(name, value, options) {
  return `<div class="seg" data-name="${name}">${options.map(([v, label]) =>
    `<button class="seg-btn ${String(v) === String(value) ? 'active' : ''}" data-v="${v}">${label}</button>`).join('')}</div>`;
}

export function mount(el) {
  const s = store.get().settings;
  const render = () => {
    el.innerHTML = `
      <section class="screen settings">
        <header class="topbar">
          <a class="icon-btn" href="#/home" aria-label="Về trang chủ">←</a>
          <h1 class="title-md">Cài đặt</h1>
          <span class="icon-btn ghost"></span>
        </header>

        <div class="card">
          <label class="field"><span>Tên của bạn</span><input id="name" maxlength="20" value="${esc(s.name)}"></label>
          <label class="field"><span>Tên linh vật</span><input id="mascotName" maxlength="12" value="${esc(s.mascotName)}"></label>
        </div>

        <div class="card">
          <h2 class="section-title">Giọng đọc</h2>
          ${seg('voice', s.voice, [['us', '🇺🇸 Anh-Mỹ'], ['uk', '🇬🇧 Anh-Anh']])}
          <button class="btn btn-soft" id="test">🔊 Nghe thử</button>
          ${hasAccent(s.voice) ? '' : `<p class="muted small">Máy này chưa có giọng ${s.voice === 'uk' ? 'Anh-Anh' : 'Anh-Mỹ'}, app sẽ dùng giọng gần nhất.</p>`}
        </div>

        <div class="card">
          <h2 class="section-title">Giao diện</h2>
          <div class="palettes">
            ${PALETTES.map((p) => `<button class="palette ${p.id === s.palette ? 'active' : ''}" data-p="${p.id}" style="--a:${p.a};--b:${p.b}"><span class="sw"></span>${p.name}</button>`).join('')}
          </div>
          ${seg('theme', s.theme, [['auto', 'Tự động'], ['light', '☀️ Sáng'], ['dark', '🌙 Tối']])}
          <div class="row-between"><span>Âm thanh</span>${seg('sound', s.sound, [[true, '🔔 Bật'], [false, '🔕 Tắt']])}</div>
        </div>

        ${hasServer() ? `<div class="card">
          <h2 class="section-title">Lưu trữ</h2>
          ${token('student')
            ? `<p>☁️ Đã kết nối Google Drive của gia đình. Học ở máy nào cũng lưu chung.</p><button class="btn btn-soft" id="syncnow">🔄 Đồng bộ ngay</button>`
            : `<p>📱 Đang <b>chỉ lưu trên máy này</b>.</p><button class="btn btn-soft" id="connect">☁️ Kết nối bằng mã gia đình</button>`}
        </div>` : ''}

        <div class="card">
          <h2 class="section-title">Học tập</h2>
          <div class="row-between"><span>Số từ mỗi lượt</span>${seg('sessionSize', s.sessionSize, [[8, '8'], [12, '12'], [16, '16']])}</div>
          <div class="row-between"><span>Mục tiêu mỗi ngày</span>${seg('dailyGoal', s.dailyGoal, [[20, '20'], [30, '30'], [50, '50']])}</div>
          <div class="row-between"><span>Học cả từ mở rộng<br><span class="muted small">Từ ít gặp trong đề thi</span></span>${seg('extended', s.extended, [[false, 'Không'], [true, 'Có']])}</div>
        </div>
        <p class="muted small center">Tự học TA · bản thử nghiệm M1–M2</p>
      </section>`;
  };
  render();

  el.addEventListener('change', (e) => {
    if (e.target.id === 'name' || e.target.id === 'mascotName') {
      store.setSetting(e.target.id, e.target.value.trim() || (e.target.id === 'name' ? 'bạn' : 'Mít'));
      toast('Đã lưu ✓');
    }
  });

  el.addEventListener('click', (e) => {
    if (e.target.closest('#test')) { speak('Hello! Welcome to your English practice.', s.voice); return; }
    if (e.target.closest('#connect')) {
      try { localStorage.removeItem('tuhocta.localOnly'); } catch { /* bỏ qua */ }
      go('#/connect');
      return;
    }
    if (e.target.closest('#syncnow')) {
      syncNow().then((ok) => toast(ok ? 'Đã đồng bộ ✓' : 'Chưa đồng bộ được, kiểm tra mạng nhé'));
      return;
    }
    const p = e.target.closest('[data-p]');
    if (p) { store.setSetting('palette', p.dataset.p); applyTheme(); render(); return; }
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    const name = b.closest('.seg').dataset.name;
    let v = b.dataset.v;
    if (v === 'true' || v === 'false') v = v === 'true';
    else if (/^\d+$/.test(v)) v = +v;
    store.setSetting(name, v);
    if (name === 'sound') setEnabled(v);
    if (name === 'theme') applyTheme();
    if (name === 'voice') speak(v === 'uk' ? 'Hello, this is British English.' : 'Hello, this is American English.', v);
    render();
  });
}

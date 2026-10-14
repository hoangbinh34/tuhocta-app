// Máy mới: nhập mã gia đình một lần để tiến độ lưu chung lên Google Drive.
import { login } from '../core/api.js';
import { syncNow } from '../core/sync.js';
import { mascotSVG } from '../ui/mascot.js';
import { go, toast } from '../ui/dom.js';

export function mount(el) {
  el.innerHTML = `
    <section class="screen welcome">
      <div class="mascot big bob">${mascotSVG('wow')}</div>
      <h1 class="title-xl">Kết nối máy này ☁️</h1>
      <p class="muted">Nhập <b>mã gia đình</b> (bố đã đặt) để học ở đâu cũng lưu chung một tiến độ.</p>
      <p class="muted small">Chưa có mã? Chọn <b>Chỉ lưu trên máy này</b>: vẫn học đầy đủ, tiến độ nằm trên máy của bạn.</p>
      <label class="field">
        <span>Mã gia đình</span>
        <input id="code" type="password" inputmode="numeric" autocomplete="off" maxlength="40" placeholder="••••••">
      </label>
      <button class="btn btn-primary btn-lg" id="go">Kết nối</button>
      <button class="btn btn-soft btn-lg" id="skip">📱 Chỉ lưu trên máy này</button>
    </section>`;
  const input = el.querySelector('#code');
  const btn = el.querySelector('#go');
  const submit = async () => {
    if (!input.value.trim()) { input.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'Đang kết nối…';
    try {
      await login('student', input.value.trim());
      try { localStorage.removeItem('tuhocta.localOnly'); } catch { /* bỏ qua */ }
      await syncNow();
      toast('Đã kết nối ✓');
      go('#/home');
    } catch (e) {
      toast(e.code === 'wrong_secret' ? 'Mã chưa đúng, thử lại nha' : 'Chưa kết nối được, kiểm tra mạng nhé');
      btn.disabled = false;
      btn.textContent = 'Kết nối';
    }
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  el.querySelector('#skip').addEventListener('click', () => {
    // Nhớ luôn lựa chọn này: lần sau mở app không hỏi lại (đổi được trong Cài đặt).
    try { localStorage.setItem('tuhocta.localOnly', '1'); } catch { /* bỏ qua */ }
    go('#/home');
  });
}

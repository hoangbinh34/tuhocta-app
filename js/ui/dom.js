// Tiện ích giao diện nhỏ dùng chung.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Chuyển màn. Nếu địa chỉ không đổi (vd đang ở #/home nhưng bị đưa sang màn tạo hồ sơ) thì vẫn vẽ lại.
export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

let toastTimer;
export function toast(msg, ms = 1800) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// Vòng tròn tiến độ (0..1).
export function ring(frac, label = '', size = 44) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return `<span class="ring" style="--p:${pct};--size:${size}px" aria-label="${pct}%"><span>${esc(label || pct + '%')}</span></span>`;
}

// Bảng trượt từ dưới lên. Trả về hàm đóng.
export function sheet(innerHTML, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true">${innerHTML}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 250); };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', close);
  onMount?.(wrap.querySelector('.sheet'), close);
  return close;
}

// iPadOS báo mình là Mac, nên nhận thêm theo màn hình cảm ứng.
export const isPhone = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

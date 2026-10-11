// Đồng bộ với Google Sheet: gửi hàng đợi (lượt học, ý kiến, cài đặt) + tiến độ từng từ, rồi kéo về bản mới nhất.
// Mất mạng thì hàng đợi nằm yên trên máy, lần sau có mạng gửi tiếp.
import * as store from './store.js';
import { call, hasServer, token } from './api.js';

const LAST_PUSH = 'tuhocta.lastPush';
let running = null;
let timer = null;

const lastPush = () => { try { return Number(localStorage.getItem(LAST_PUSH)) || 0; } catch { return 0; } };

export const canSync = () => hasServer() && !!token('student');

async function push() {
  const items = store.queue().slice();
  const since = lastPush();
  const startedAt = Date.now();
  const progress = {};
  for (const p of store.profiles()) {
    const changed = Object.entries(p.progress).filter(([, v]) => v.lastAt > since);
    if (changed.length) progress[p.id] = Object.fromEntries(changed);
  }
  if (!items.length && !Object.keys(progress).length) return;
  // Luôn gửi kèm danh sách hồ sơ trên máy (máy chủ ghi đè theo id), để hồ sơ tạo lúc chưa kết nối vẫn lên đủ.
  const profileItems = store.profiles().map((p) => ({
    type: 'profile', profileId: p.id, at: p.createdAt,
    payload: { id: p.id, name: p.settings.name, track: p.track },
  }));
  // Mục 'profile' trong hàng đợi đã có trong danh sách trên, bỏ đi để không gửi trùng.
  const rest = items.filter((i) => i.type !== 'profile');
  await call('push', { token: token('student'), items: [...profileItems, ...rest], progress });
  store.dropQueue(items.length);
  try { localStorage.setItem(LAST_PUSH, String(startedAt)); } catch { /* bỏ qua */ }
}

async function pull() {
  const r = await call('pull', { token: token('student') });
  store.mergeRemote(r);
}

// Đồng bộ ngay (gộp các lần gọi chồng nhau thành một).
export function syncNow() {
  if (!canSync() || !navigator.onLine) return Promise.resolve(false);
  if (!running) {
    running = (async () => {
      try { await push(); await pull(); return true; }
      catch (e) { console.warn('Đồng bộ lỗi:', e.message); return false; }
      finally { running = null; }
    })();
  }
  return running;
}

// Gọi sau khi có dữ liệu mới: đợi một chút để gộp nhiều thay đổi vào một lần gửi.
export function syncSoon(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export function startAutoSync() {
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('tuhocta:changed', () => syncSoon());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 5 * 60 * 1000);
}

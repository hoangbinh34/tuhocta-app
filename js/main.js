// Điểm vào của app: định tuyến theo #hash, áp giao diện, mở khoá âm thanh.

import * as store from './core/store.js';
import { setTrack, setSubject, getSubjects } from './core/data.js';
import { subjectRoute, loadSubject, openSubjects, forceFlag, vatlyFlag } from './core/subject.js';
import { hasServer, token } from './core/api.js';
import { syncNow, startAutoSync } from './core/sync.js';
import { unlock, setEnabled } from './core/sound.js';
import { esc, toast } from './ui/dom.js';

const ROUTES = {
  welcome: () => import('./screens/welcome.js'),
  profiles: () => import('./screens/profiles.js'),
  connect: () => import('./screens/connect.js'),
  parent: () => import('./screens/parent.js'),
  home: () => import('./screens/home.js'),
  subjects: () => import('./screens/subjects.js'),
  settings: () => import('./screens/settings.js'),
  topics: () => import('./modules/vocab-scramble/topics.js'),
  play: () => import('./modules/vocab-scramble/play.js'),
  result: () => import('./modules/vocab-scramble/result.js'),
  ex: () => import('./modules/exercise/sets.js'),
  'ex-play': () => import('./modules/exercise/play.js'),
  'ex-result': () => import('./modules/exercise/result.js'),
  mock: () => import('./modules/exercise/mock.js'),
};

export function applyTheme() {
  const p = store.get();
  const s = p ? p.settings : { palette: 'mint', theme: 'auto' };
  const root = document.documentElement;
  root.dataset.palette = s.palette;
  root.dataset.track = p?.track || '';
  if (s.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  setEnabled(p ? p.settings.sound : true);
}

let cleanup = null;
let seq = 0;
// Các màn không thuộc môn nào: không bị đẩy sang màn chọn môn.
const NO_SUBJECT = ['welcome', 'profiles', 'connect', 'parent', 'settings'];

// Môn của hồ sơ đang học và màn cần vào (xem core/subject.js). tracks.json lỗi thì học Tiếng Anh như cũ.
async function pickSubject(profile, name) {
  let subjects = [];
  try { subjects = await getSubjects(profile.track); } catch (e) { console.warn(e); }
  const force = forceFlag(location);
  const thu = vatlyFlag(location);
  const r = subjectRoute({ subjects, saved: loadSubject(profile.id), force, thu });
  const canChoose = openSubjects(subjects, { thu }).length >= 2 || force;
  if (name === 'subjects') return { name: canChoose ? 'subjects' : 'home', sid: r.sid };   // nút 📚 Đổi môn
  if (r.screen === 'subjects' && !NO_SUBJECT.includes(name)) return { name: 'subjects' };
  return { name, sid: r.sid };
}

async function route() {
  const my = ++seq;
  const isCurrent = () => my === seq;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  let name = ROUTES[path] ? path : 'home';
  // Chưa có hồ sơ nào → tạo mới. Có hồ sơ nhưng chưa chọn → "Ai đang học?".
  // Có máy chủ mà máy này chưa nhập mã gia đình → hỏi trước (bỏ qua được trong phiên này).
  let skipConnect = false;
  try { skipConnect = localStorage.getItem('tuhocta.localOnly') === '1'; } catch { /* bỏ qua */ }
  const needConnect = hasServer() && !token('student') && !skipConnect;
  const profile = store.get();
  if (name === 'parent' || name === 'connect') { /* không cần hồ sơ */ }
  else if (needConnect) name = 'connect';
  else if (!store.profiles().length) name = 'welcome';
  else if (!profile && name !== 'welcome') name = 'profiles';
  setTrack(profile?.track);
  if (profile) {
    const p = await pickSubject(profile, name);
    if (!isCurrent()) return;
    name = p.name;
    setSubject(p.sid);
  } else setSubject(null);
  applyTheme();
  const params = Object.fromEntries(new URLSearchParams(query));

  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  // Bảng trượt (chọn độ khó, "Dừng lượt") của màn cũ không được đè lên màn mới.
  document.querySelectorAll('.sheet-wrap').forEach((s) => s.remove());
  const app = document.getElementById('app');
  // Mỗi màn có khung riêng: listener của màn cũ đi theo khung cũ, và màn tải chậm
  // (người dùng đã bấm sang màn khác) chỉ ghi vào khung đã bị bỏ.
  const view = document.createElement('div');
  view.className = 'view';
  try {
    const mod = await ROUTES[name]();
    if (!isCurrent()) return;
    app.replaceChildren(view);
    app.dataset.screen = name;
    window.scrollTo(0, 0);
    const c = await mod.mount(view, params, { isCurrent });
    if (isCurrent()) cleanup = typeof c === 'function' ? c : null;
    else if (typeof c === 'function') c();
  } catch (e) {
    console.error(e);
    if (isCurrent()) app.innerHTML = `<section class="screen center"><h2>Ôi, có lỗi rồi 😿</h2><p class="muted">${esc(e.message || e)}</p><a class="btn btn-primary" href="#/home">Về trang chủ</a></section>`;
  }
}

store.load();
applyTheme();
startAutoSync();
// Mở app: kéo tiến độ mới nhất từ máy khác về rồi vẽ lại màn hiện tại.
// Chỉ vẽ lại ở các màn tổng quan, không cắt ngang lượt đang chơi.
syncNow().then((ok) => {
  if (ok && ['home', 'profiles', 'topics', 'welcome', 'subjects'].includes(document.getElementById('app').dataset.screen)) route();
});
window.addEventListener('tuhocta:save-failed', () => toast('⚠️ Máy hết chỗ lưu, tiến độ có thể không được ghi', 4000));
window.addEventListener('tuhocta:recovered', () => toast('Dữ liệu trên máy bị lỗi, đã cất bản sao và bắt đầu lại', 5000));
window.addEventListener('hashchange', route);
// Âm thanh trên iPhone chỉ phát sau lần chạm đầu.
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
route();

// Lưu app trên máy để mở được khi mất mạng (chỉ chạy trên https hoặc localhost).
// Có bản mới thì hiện dải "Có bản mới, bấm để cập nhật" (xem core/update.js).
// Import động: lúc chuyển từ bản cache cũ mà thiếu update.js thì chỉ mất dải, app vẫn chạy và SW vẫn được đăng ký.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    import('./core/update.js').then((m) => m.watchUpdates()).catch((e) => {
      console.warn('Không tải được update.js:', e?.message);
      navigator.serviceWorker?.register('sw.js').catch(() => {});
    });
  });
}

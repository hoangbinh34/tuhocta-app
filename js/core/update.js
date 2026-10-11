// Báo "Có bản mới": service worker mới cài xong thì nằm chờ (reg.waiting), trang hiện dải.
// Không tự tải lại (con có thể đang làm đề có đồng hồ): con bấm dải thì trang mới bảo bản mới nắm trang rồi tải lại.
// Phần quyết định là hàm thuần để test được bằng node (tools/test-update.mjs).

// Trạng thái: đã hiện dải chưa, con đã bấm chưa, đã tải lại chưa.
export function initState() {
  return { shown: false, accepted: false, reloading: false };
}

// Thấy một service worker đang chờ (lúc mở trang có sẵn reg.waiting, hoặc vừa cài xong).
// Lần cài đầu (trang chưa có service worker nào nắm, controller null) thì trang đang chạy đúng bản mới, không báo.
export function onWaiting(state, hasController) {
  const show = !!hasController && !state.shown;
  return { state: { ...state, shown: state.shown || show }, show };
}

// Con bấm dải: gửi SKIP_WAITING cho bản đang chờ (bấm nhiều lần cũng chỉ gửi một lần).
// Không còn bản chờ (tab khác vừa cập nhật, bản mới đã nắm trang) thì tải lại trang để sang bản mới.
export function onAccept(state, hasWaiting = true) {
  if (state.shown && !hasWaiting) {
    const reload = !state.reloading;
    return { state: { ...state, accepted: true, reloading: true }, message: null, reload };
  }
  const send = state.shown && !state.accepted;
  return { state: { ...state, accepted: state.accepted || send }, message: send ? { type: 'SKIP_WAITING' } : null, reload: false };
}

// Có "controllerchange": chỉ tải lại khi do con bấm, và chỉ một lần.
export function onControllerChange(state) {
  const reload = state.accepted && !state.reloading;
  return { state: { ...state, reloading: state.reloading || reload }, reload };
}

// Hỏi máy chủ có sw.js mới không: mỗi lần mở app hoặc quay lại app, cách nhau ít nhất `gap` ms.
export const CHECK_GAP = 60e3;
export function shouldCheck(lastAt, now, gap = CHECK_GAP) {
  return !lastAt || now - lastAt >= gap;
}

// Màn đang làm bài: dặn con làm xong rồi hãy bấm.
const BUSY = ['play', 'ex-play', 'mock'];
export function bannerText(screen) {
  return BUSY.includes(screen)
    ? '✨ Có bản mới. Làm xong bài rồi bấm để cập nhật'
    : '✨ Có bản mới, bấm để cập nhật';
}

function showBanner(onClick) {
  if (document.getElementById('update-bar')) return;      // dải và MutationObserver chỉ gắn một lần
  const bar = document.createElement('button');
  bar.id = 'update-bar';
  bar.type = 'button';
  bar.setAttribute('aria-live', 'polite');
  bar.addEventListener('click', onClick);
  document.body.prepend(bar);
  // Dải đã chừa tai thỏ: .screen thôi chừa lần nữa, #toast lùi xuống dưới dải (css/app.css).
  document.body.classList.add('has-update-bar');
  const app = document.getElementById('app');
  const paint = () => {
    bar.textContent = bannerText(app?.dataset.screen);
    document.body.style.setProperty('--update-bar-h', bar.offsetHeight + 'px');
  };
  paint();
  if (app) new MutationObserver(paint).observe(app, { attributes: true, attributeFilter: ['data-screen'] });
}

export function watchUpdates() {
  const sw = navigator.serviceWorker;
  let state = initState();
  let lastAt = 0;
  sw.addEventListener('controllerchange', () => {
    const r = onControllerChange(state);
    state = r.state;
    if (r.reload) location.reload();
  });
  sw.register('sw.js').then((reg) => {
    const waiting = () => {
      const r = onWaiting(state, sw.controller);
      state = r.state;
      if (r.show) showBanner(() => {
        const a = onAccept(state, !!reg.waiting);
        state = a.state;
        if (a.message) reg.waiting.postMessage(a.message);
        if (a.reload) location.reload();
      });
    };
    if (reg.waiting) waiting();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') waiting(); });
    });
    lastAt = Date.now();                                   // mở trang thì trình duyệt vừa tự kiểm sw.js rồi
    const check = () => {
      if (!shouldCheck(lastAt, Date.now())) return;
      lastAt = Date.now();
      reg.update().catch(() => { /* mất mạng: lần sau hỏi lại */ });
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch((e) => console.warn('SW:', e.message));
}

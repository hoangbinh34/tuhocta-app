// Service worker: lưu sẵn app + bộ từ trên máy để học được cả khi mất mạng (về quê, trên xe…).
// Cách làm: mỗi bản app có một cache riêng (tên CACHE). File của app chỉ lấy từ cache của bản đang chạy;
// không tải nền ghi đè, để trang đang mở chạy trọn một bản (kể cả các file import() về sau).
// Đưa lên bằng tools/deploy.mjs: tự gắn CACHE theo hash nội dung. Tên tuhocta-v9 chỉ dùng khi chạy local/test.
// Máy các con thấy sw.js đổi thì cài bản mới vào cache mới rồi nằm chờ, trang hiện dải "Có bản mới";
// bản mới chỉ nắm trang khi con bấm dải (SKIP_WAITING).
const CACHE = 'tuhocta-0436ed14a4';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'favicon.png', 'icon-192.png', 'apple-touch-icon.png', 'icon-512.png',
  'css/theme.css', 'css/app.css',
  'js/main.js', 'js/config.js',
  'js/core/store.js', 'js/core/data.js', 'js/core/srs.js', 'js/core/level.js', 'js/core/sound.js', 'js/core/speech.js', 'js/core/api.js', 'js/core/sync.js', 'js/core/update.js', 'js/core/subject.js',
  'js/ui/dom.js', 'js/ui/mascot.js', 'js/ui/confetti.js',
  'js/screens/welcome.js', 'js/screens/profiles.js', 'js/screens/home.js', 'js/screens/settings.js', 'js/screens/connect.js', 'js/screens/parent.js', 'js/screens/subjects.js',
  'js/modules/_registry.js', 'js/modules/vocab-scramble/topics.js', 'js/modules/vocab-scramble/play.js', 'js/modules/vocab-scramble/result.js',
  'js/modules/exercise/check.js', 'js/modules/exercise/sets.js', 'js/modules/exercise/play.js', 'js/modules/exercise/result.js', 'js/modules/exercise/mock.js',
  'data/tracks.json',
];

// Đọc một file JSON; lỗi mạng hoặc file hỏng thì trả null (chỉ mất phần danh sách nằm dưới file đó).
async function getJson(u) {
  try {
    const res = await fetch(u, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Lấy danh sách file dữ liệu từ chính dữ liệu, để thêm Unit/bài mới không phải sửa file này.
// Duyệt từng môn của từng lộ trình (lộ trình chưa khai môn thì dùng đường dẫn cấp lộ trình); môn không khai đường dẫn thì bỏ qua.
async function dataFiles() {
  const out = new Set();
  const root = await getJson('data/tracks.json');
  for (const t of root?.tracks || []) {
    const subjects = Array.isArray(t.subjects) && t.subjects.length ? t.subjects : [t];
    for (const s of subjects) {
      if (s.curriculum) {
        out.add('data/' + s.curriculum);
        const cur = await getJson('data/' + s.curriculum);
        const dir = 'data/' + s.curriculum.replace(/[^/]+$/, '');
        for (const g of cur?.grades || []) for (const u of g.units || []) if (u.file) out.add(dir + u.file);
      }
      // Bài tập (ngữ âm, ngữ pháp…): đọc danh sách từ _modules.json và _index.json của từng phần.
      if (s.exercises) {
        out.add('data/' + s.exercises);
        const mods = await getJson('data/' + s.exercises);
        const exDir = 'data/' + s.exercises.replace(/[^/]+$/, '');
        for (const m of mods?.modules || []) {
          out.add(exDir + m.dir + '/_index.json');
          const list = await getJson(exDir + m.dir + '/_index.json');
          for (const x of Array.isArray(list) ? list : []) {
            if (x?.file) out.add(exDir + x.file);
            // Hình của bài (Vật lý): mục bài khai images, đường dẫn tính từ thư mục môn như file. Không phải mảng thì bỏ qua.
            for (const im of Array.isArray(x?.images) ? x.images : []) if (typeof im === 'string') out.add(exDir + im);
          }
        }
      }
    }
  }
  return [...out];
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bỏ qua bộ nhớ đệm của trình duyệt, để bản mới không bị lẫn file cũ.
    const fresh = (list) => list.map((u) => new Request(u, { cache: 'reload' }));
    // Mã app phải đủ cả bộ: thiếu một file thì cài hỏng, trình duyệt thử lại lần sau, con vẫn chạy bản cũ.
    await cache.addAll(fresh(CORE));
    // Dữ liệu: từng file một, file lỗi thì bỏ qua; lúc con mở tới file đó, fetch bên dưới tải rồi lưu vào cache này.
    let files = [];
    try { files = await dataFiles(); } catch { /* mất mạng giữa chừng: dữ liệu tải dần khi dùng */ }
    await Promise.all(fresh(files).map((r) => cache.add(r).catch(() => {})));
  })());
});

// Con bấm dải "Có bản mới" thì trang gửi SKIP_WAITING: lúc đó bản mới mới nắm trang.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Lần cài đầu không phải chờ: claim() để chạy được khi mất mạng ngay. Cache cũ chỉ xoá ở đây,
// lúc trang bản cũ đã tải lại sang bản mới.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // gửi dữ liệu lên Google: không chặn
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (!sameOrigin) {
      // Google Fonts: dùng bản đã lưu, tải nền cho lần sau (không dính tới mã app).
      const cached = await cache.match(req);
      const fresh = fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      return (await fresh) || Response.error();
    }
    // File của app: chỉ cache của bản này. Đã có thì trả luôn, không tải nền, không ghi đè.
    // Mở trang (navigate) thì trả index.html của bản này, mất mạng vẫn chạy.
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    // Chưa có (file dữ liệu lúc cài bị lỗi): tải mạng rồi lưu vào chính cache này.
    // Lưu ý: file thiếu trong cache của bản N được tải từ mạng, lúc đó có thể đã là file của bản N+1 và được lưu vào cache N;
    // cache của một bản không tự làm mới (CDN trả file cũ lúc cài thì file đó nằm lại tới lần đưa lên sau).
    // Chỉ trộn dữ liệu, không trộn mã app (mã app cài đủ bộ bằng addAll), chấp nhận được.
    try {
      const res = await fetch(req);
      if (res.ok) await cache.put(key, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});

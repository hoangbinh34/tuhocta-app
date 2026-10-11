import * as store from '../core/store.js';
import { getAllWords, findUnit, allUnits, getTrack, getSubjects, currentSubject, getSubject, getExerciseSets } from '../core/data.js';
import { isDue, allowedPriorities, DIFFICULTY } from '../core/srs.js';
import { modulesOf } from '../modules/_registry.js';
import { openSubjects, forceFlag, vatlyFlag, homeBlocks } from '../core/subject.js';
import { mascotSVG, LINES, pick } from '../ui/mascot.js';
import { esc, go, ring } from '../ui/dom.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export async function mount(el) {
  const st = store.get();
  const s = st.settings;
  const subject = currentSubject();
  const blocks = homeBlocks(subject, st.lastBy);
  const words = blocks.vocab ? await getAllWords() : [];
  const now = Date.now();
  const prios = allowedPriorities(s.extended);
  const dueCount = words.filter((w) => prios.includes(w.priority ?? 2) && isDue(st.progress[w.id], now)).length;
  const t = store.today();
  const streak = store.streak();
  const track = await getTrack(st.track);
  const listedModules = modulesOf(st.track, subject);
  // Phần Vật lý chưa có bài hiện Sắp có; không đổi cấu hình module dùng chung.
  const modules = subject === 'vatly' ? await Promise.all(listedModules.map(async (m) => ({
    ...m, enabled: m.enabled && (await getExerciseSets(m.id, st.track, subject)).length > 0,
  }))) : listedModules;
  // Nút 📚 Đổi môn chỉ có khi lộ trình có từ 2 môn mở trở lên (hoặc đang thử với ?thu=chonmon).
  const thu = vatlyFlag(location);
  const canSwitch = openSubjects(await getSubjects(st.track), { thu }).length >= 2 || forceFlag(location);
  const many = store.profiles().length > 1;

  // Bài "học tiếp": lượt gần nhất, hoặc Unit đầu tiên có dữ liệu.
  let last = st.last;
  if (blocks.vocab && !last) {
    const first = (await allUnits()).find((u) => u.file);
    last = { unitId: first.id, difficulty: 'easy' };
  }
  const unit = blocks.vocab ? await findUnit(last.unitId) : null;
  const diff = DIFFICULTY[last?.difficulty] || DIFFICULTY.easy;

  const lastSeen = st.sessions.at(-1)?.endedAt || now;
  const sleepy = st.sessions.length && now - lastSeen > 3 * 864e5;
  const line = sleepy ? pick(LINES.sleepy) : pick(LINES.greet);

  el.innerHTML = `
    <section class="screen home">
      <header class="topbar">
        <div>
          <div class="muted small">${greeting()},</div>
          <h1 class="title-lg">${esc(s.name || 'bạn')} ${new Date().getHours() >= 18 ? '🌙' : '☀️'}</h1>
        </div>
        <div class="topbar-actions">
          ${canSwitch ? '<button class="icon-btn" id="subject" aria-label="Đổi môn">📚</button>' : ''}
          <button class="icon-btn" id="switch" aria-label="${many ? 'Đổi người học' : 'Thêm người học'}">👥</button>
          <a class="icon-btn" href="#/settings" aria-label="Cài đặt">⚙️</a>
        </div>
      </header>
      <div class="track-badge">${track.emoji} ${esc(track.title)}</div>

      <div class="hero-row">
        <div class="mascot ${sleepy ? '' : 'bob'}">${mascotSVG(sleepy ? 'sleep' : 'happy')}</div>
        <div class="bubble">${esc(line)}</div>
      </div>

      <div class="stats">
        <div class="stat"><span class="stat-big">🔥 ${streak}</span><span class="muted small">ngày liên tục</span></div>
        <div class="stat">${ring(t.words / s.dailyGoal, `${t.words}`, 52)}<span class="muted small">/${s.dailyGoal} câu & từ hôm nay</span></div>
        <div class="stat"><span class="stat-big">⏱️ ${Math.round(t.seconds / 60)}'</span><span class="muted small">học hôm nay</span></div>
      </div>

      ${blocks.vocab ? `<button class="card card-cta" id="continue">
        <span class="cta-emoji">${unit?.emoji || '🔤'}</span>
        <span class="cta-text">
          <span class="cta-title">▶ Học tiếp</span>
          <span class="cta-sub">Lớp ${unit?.grade} · Unit ${unit?.no}: ${esc(unit?.title)} · ${diff.emoji} ${diff.label}</span>
        </span>
      </button>

      <button class="card card-review ${dueCount ? '' : 'is-empty'}" id="review" ${dueCount ? '' : 'disabled'}>
        <span>🔁</span>
        <span>${dueCount ? `Ôn <b>${dueCount}</b> từ đến hạn` : 'Chưa có từ nào đến hạn ôn ✨'}</span>
      </button>` : ''}

      ${blocks.continue ? `<a class="card card-cta" id="continue-vatly" href="${esc(blocks.continue)}">
        <span class="cta-emoji">📘</span>
        <span class="cta-text"><span class="cta-title">▶ Học tiếp</span><span class="cta-sub">Vật lý · Tiếp tục bài gần nhất</span></span>
      </a>` : ''}

      <h2 class="section-title">Các phần học</h2>
      <div class="modules">
        ${modules.map((m) => `
          <a class="module ${m.enabled ? '' : 'locked'}" ${m.enabled ? `href="${m.route}"` : 'aria-disabled="true"'}>
            <span class="module-emoji">${m.emoji}</span>
            <span class="module-text"><b>${esc(m.title)}</b><span class="muted small">${esc(m.desc)}</span></span>
            <span class="module-tag">${m.enabled ? '›' : '🔒 Sắp có'}</span>
          </a>`).join('')}
      </div>
    </section>`;

  el.querySelector('#switch').addEventListener('click', () => {
    store.signOut();
    go(many ? '#/profiles' : '#/welcome');
  });
  el.querySelector('#subject')?.addEventListener('click', () => go('#/subjects'));
  el.querySelector('#continue')?.addEventListener('click', () => go(`#/play?unit=${last.unitId}&d=${last.difficulty}`));
  el.querySelector('#review')?.addEventListener('click', () => go(`#/play?unit=review&d=${last.difficulty}`));
}

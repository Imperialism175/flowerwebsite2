// Разметка страницы собирается из content.js.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const poppy = (fill = '#f4b63c', core = '#b5560e') => `
  <svg viewBox="0 0 100 100" aria-hidden="true">
    ${[0, 72, 144, 216, 288]
      .map((r) => `<ellipse cx="50" cy="27" rx="17" ry="25" fill="${fill}" transform="rotate(${r} 50 50)" />`)
      .join('')}
    <circle cx="50" cy="50" r="11" fill="${core}" />
  </svg>`;

const STICKERS = [
  { html: poppy(), x: 6, y: 8, r: -12, size: 110 },
  { html: poppy('#ffd76a', '#c46b12'), x: 78, y: 4, r: 14, size: 84 },
  { html: '<span class="tape">flowertalker</span>', x: 60, y: 82, r: -5, size: 0 },
  { html: '<span class="emoji">🌻</span>', x: 88, y: 60, r: 10, size: 0 },
  { html: '<span class="emoji">☀️</span>', x: 2, y: 70, r: -8, size: 0 },
  { html: poppy('#ff9d2e', '#7a2e05'), x: 40, y: -6, r: 22, size: 64 },
  { html: '<span class="stamp">golden<br/>hour</span>', x: 22, y: 86, r: 8, size: 0 },
];

export function renderPage(c) {
  const title = [...c.name].map((ch) => `<span class="ch">${esc(ch)}</span>`).join('');
  const words = c.quote
    .split(' ')
    .map((w) => `<span class="w">${esc(w)}</span>`)
    .join(' ');

  document.querySelector('#story').innerHTML = `
    <section class="chapter hero" id="top" data-chapter>
      <p class="eyebrow" data-fade>личный сад · est. 2026</p>
      <h1 class="hero-title" aria-label="${esc(c.name)}">${title}</h1>
      <p class="tagline" data-fade>${esc(c.tagline)}</p>
      <p class="intro" data-fade>${esc(c.intro)}</p>
      <a class="scroll-hint" href="#about" data-fade><span>листай медленно</span><i></i></a>
    </section>

    <section class="chapter about" id="about" data-chapter>
      <article class="card glass about-card" data-reveal>
        <p class="eyebrow">глава I · знакомство</p>
        <h2>${esc(c.about.title)}</h2>
        ${c.about.text.map((t) => `<p>${esc(t)}</p>`).join('')}
        <dl class="facts">
          ${c.about.facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}
        </dl>
        <div class="about-flower">${poppy()}</div>
      </article>
    </section>

    <section class="chapter interests" id="interests" data-chapter>
      <div class="interests-head">
        <p class="eyebrow">глава II · что цветёт</p>
        <h2>Мои грядки</h2>
        <p class="hint">иду по полю — увлечения растут вдоль тропинки</p>
      </div>
      <div class="track">
        ${c.interests
          .map(
            (it, i) => `
          <article class="card interest" style="--i:${i}">
            <span class="num">0${i + 1}</span>
            <span class="badge" aria-hidden="true">${esc(it.emoji)}</span>
            <h3>${esc(it.title)}</h3>
            <p>${esc(it.text)}</p>
            <ul class="tags">${it.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          </article>`,
          )
          .join('')}
      </div>
    </section>

    <section class="chapter now" id="now" data-chapter>
      <div class="now-head">
        <p class="eyebrow">глава III · прямо сейчас</p>
        <h2>Доска на солнце</h2>
        <p class="hint">стикеры можно таскать</p>
      </div>
      <div class="board">
        <div class="widgets">
          ${c.now
            .map(
              (w, i) => `
            <div class="card widget" data-reveal>
              <p class="w-title">${esc(w.title)}</p>
              <p class="w-value">${esc(w.value)}</p>
              ${i === 0 ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' : ''}
            </div>`,
            )
            .join('')}
          <div class="card widget widget-count" data-reveal>
            <p class="w-title">Ты посадил(а) цветов</p>
            <p class="w-value big"><span id="planted-count">0</span> ✿</p>
          </div>
        </div>
        ${STICKERS.map(
          (s, i) => `<div class="sticker" data-id="${i}" style="--x:${s.x}%;--y:${s.y}%;--r:${s.r}deg;${s.size ? `width:${s.size}px` : ''}">${s.html}</div>`,
        ).join('')}
      </div>
    </section>

    <section class="chapter quote" id="quote" data-chapter>
      <p class="eyebrow">глава IV · закат</p>
      <blockquote>${words}</blockquote>
    </section>

    <section class="chapter night" id="night" data-chapter>
      <div class="night-inner">
        <p class="eyebrow">глава V · ночь в поле</p>
        <h2>Спасибо, что дошёл(-шла) до ночи</h2>
        <nav class="links">
          ${c.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} <span>↗</span></a>`).join('')}
        </nav>
        <p class="plant-tip">${esc(c.outro)}</p>
        <footer>© 2026 ${esc(c.name)} · <a href="#top">к рассвету ↑</a></footer>
      </div>
    </section>`;
}

// Перетаскиваемые стикеры; позиции запоминаются в браузере гостя.
export function initStickers(board) {
  if (!board) return;
  const KEY = 'flowertalker-stickers';
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    /* пусто */
  }
  board.querySelectorAll('.sticker').forEach((el) => {
    const id = el.dataset.id;
    let [dx, dy] = saved[id] || [0, 0];
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const sx = e.clientX - dx;
      const sy = e.clientY - dy;
      const move = (ev) => {
        dx = ev.clientX - sx;
        dy = ev.clientY - sy;
        el.style.setProperty('--dx', `${dx}px`);
        el.style.setProperty('--dy', `${dy}px`);
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        saved[id] = [Math.round(dx), Math.round(dy)];
        try {
          localStorage.setItem(KEY, JSON.stringify(saved));
        } catch {
          /* не сохраним — не страшно */
        }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  });
}

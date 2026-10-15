// Тайная админка: 5 быстрых кликов по ✿ в логотипе или Ctrl+Shift+F.
// Правки сразу видны в этом браузере (черновик), а «Опубликовать» коммитит
// src/content.json в репозиторий — GitHub Actions пересобирает сайт для всех.

const DRAFT_KEY = 'flowertalker:content-draft';
const GH_KEY = 'flowertalker:gh';
const DEFAULT_REPO = 'Imperialism175/flowerwebsite2';
const FILE = 'src/content.json';

const LABELS = {
  name: 'имя',
  tagline: 'подзаголовок',
  intro: 'вступление',
  about: 'глава I · знакомство',
  title: 'заголовок',
  text: 'текст',
  facts: 'факты',
  label: 'подпись',
  value: 'значение',
  folds: 'раскрывашки (kin-list и т.п.)',
  items: 'строки',
  interests: 'глава II · грядки',
  emoji: 'эмодзи',
  tags: 'теги',
  now: 'глава III · «сейчас»',
  href: 'ссылка',
  quote: 'цитата на закате',
  links: 'ссылки в конце',
  outro: 'подсказка ночью',
  music: 'музыка',
  youtube: 'id видео на YouTube',
  volume: 'громкость (0–100)',
};

const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* нечего удалять */
    }
  },
};

export function loadContent(base) {
  return store.get(DRAFT_KEY) || base;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// пустая заготовка для нового элемента списка — по образцу уже существующих
function blank(sample) {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object') return Object.fromEntries(Object.keys(sample).map((k) => [k, blank(sample[k])]));
  return typeof sample === 'number' ? 0 : '';
}

function findSample(root, key) {
  let found;
  (function walk(v) {
    if (found !== undefined || !v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (k === key && Array.isArray(x) && x.length) return (found = x[0]);
      walk(x);
    }
  })(root);
  return found;
}

function field(key, value, path) {
  const label = esc(LABELS[key] ?? key);
  if (typeof value === 'number')
    return `<label class="adm-f"><span>${label}</span><input type="number" data-path="${path}" data-num value="${value}"></label>`;
  const long = String(value).length > 60 || key === 'text' || key === 'intro';
  return `<label class="adm-f"><span>${label}</span>${
    long
      ? `<textarea rows="3" data-path="${path}">${esc(value)}</textarea>`
      : `<input type="text" data-path="${path}" value="${esc(value)}">`
  }</label>`;
}

function render(value, key, path) {
  if (Array.isArray(value)) {
    const items = value
      .map(
        (v, i) => `
        <div class="adm-item">
          <button type="button" class="adm-del" data-del="${path}" data-i="${i}" title="удалить">×</button>
          ${render(v, typeof v === 'object' ? '' : `#${i + 1}`, `${path}.${i}`)}
        </div>`,
      )
      .join('');
    return `<fieldset class="adm-group"><legend>${esc(LABELS[key] ?? key)}</legend>${items}
      <button type="button" class="adm-add" data-add="${path}" data-key="${esc(key)}">+ добавить</button></fieldset>`;
  }
  if (value && typeof value === 'object') {
    const inner = Object.entries(value)
      .map(([k, v]) => render(v, k, path ? `${path}.${k}` : k))
      .join('');
    return key ? `<fieldset class="adm-group"><legend>${esc(LABELS[key] ?? key)}</legend>${inner}</fieldset>` : inner;
  }
  return field(key, value, path);
}

const getAt = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
function setAt(obj, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function publish(data, { token, repo }) {
  const api = `https://api.github.com/repos/${repo}/contents/${FILE}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const cur = await fetch(api, { headers });
  if (!cur.ok) throw new Error(`не вижу ${FILE} (${cur.status})`);
  const { sha } = await cur.json();
  const res = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'Update site content from admin panel',
      content: utf8ToBase64(JSON.stringify(data, null, 2) + '\n'),
      sha,
    }),
  });
  if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
}

export function initAdmin(base) {
  let data = structuredClone(loadContent(base));
  let panel = null;

  const open = () => {
    if (panel) return;
    const gh = store.get(GH_KEY) || { token: '', repo: DEFAULT_REPO };
    const hasDraft = !!store.get(DRAFT_KEY);
    panel = document.createElement('div');
    panel.className = 'adm';
    panel.innerHTML = `
      <div class="adm-box" role="dialog" aria-label="Админка" aria-modal="true">
        <header class="adm-head">
          <b>✿ админка</b>
          <button type="button" class="adm-x" data-act="close" aria-label="закрыть">×</button>
        </header>
        <p class="adm-note">${
          hasDraft ? 'Сейчас ты видишь <b>черновик</b> — он живёт только в этом браузере.' : 'Правь что угодно и жми «Применить».'
        } Гости увидят изменения после «Опубликовать».</p>
        <form class="adm-form">${render(data, '', '')}</form>
        <details class="adm-gh">
          <summary>публикация на GitHub</summary>
          <label class="adm-f"><span>репозиторий</span><input type="text" name="repo" value="${esc(gh.repo)}"></label>
          <label class="adm-f"><span>токен (fine-grained, Contents: read &amp; write только для этого репо)</span>
            <input type="password" name="token" autocomplete="off" value="${esc(gh.token)}"></label>
          <p class="adm-note">Токен хранится только в этом браузере.</p>
        </details>
        <footer class="adm-foot">
          <button type="button" data-act="apply">Применить</button>
          <button type="button" data-act="publish" class="adm-main">Опубликовать</button>
          <button type="button" data-act="export">Скачать JSON</button>
          <button type="button" data-act="reset" class="adm-ghost">Сбросить черновик</button>
        </footer>
        <p class="adm-status" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(panel);
    document.documentElement.classList.add('adm-open');
    panel.querySelector('input, textarea')?.focus();

    const status = (t) => (panel.querySelector('.adm-status').textContent = t);
    const rerender = () => (panel.querySelector('.adm-form').innerHTML = render(data, '', ''));
    const ghCreds = () => {
      const creds = {
        repo: panel.querySelector('[name=repo]').value.trim(),
        token: panel.querySelector('[name=token]').value.trim(),
      };
      store.set(GH_KEY, creds);
      return creds;
    };

    panel.addEventListener('input', (e) => {
      const p = e.target.dataset.path;
      if (p) setAt(data, p, 'num' in e.target.dataset ? Number(e.target.value) : e.target.value);
    });

    panel.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.add) {
        const arr = getAt(data, t.dataset.add);
        arr.push(blank(arr[0] ?? findSample(data, t.dataset.key) ?? ''));
        return rerender();
      }
      if (t.dataset.del) {
        getAt(data, t.dataset.del).splice(Number(t.dataset.i), 1);
        return rerender();
      }
      switch (t.dataset.act) {
        case 'close':
          return close();
        case 'apply':
          store.set(DRAFT_KEY, data);
          return location.reload();
        case 'reset':
          store.del(DRAFT_KEY);
          return location.reload();
        case 'export': {
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
          Object.assign(document.createElement('a'), { href: url, download: 'content.json' }).click();
          return URL.revokeObjectURL(url);
        }
        case 'publish': {
          const creds = ghCreds();
          if (!creds.token) {
            panel.querySelector('.adm-gh').open = true;
            return status('Вставь токен GitHub в блоке «публикация».');
          }
          t.disabled = true;
          status('Публикую…');
          try {
            await publish(data, creds);
            store.set(DRAFT_KEY, data);
            status('Готово! Сайт пересоберётся за 1–2 минуты.');
          } catch (err) {
            status(`Не вышло: ${err.message}`);
          } finally {
            t.disabled = false;
          }
        }
      }
    });
    panel.addEventListener('click', (e) => e.target === panel && close());
  };

  const close = () => {
    panel?.remove();
    panel = null;
    document.documentElement.classList.remove('adm-open');
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
      e.preventDefault();
      panel ? close() : open();
    }
  });

  // незаметный вход: 5 быстрых кликов по цветку в логотипе
  const flower = document.querySelector('.logo span');
  let clicks = [];
  flower?.addEventListener('click', (e) => {
    const now = performance.now();
    clicks = clicks.filter((t) => now - t < 1500).concat(now);
    if (clicks.length >= 5) {
      e.preventDefault();
      e.stopPropagation();
      clicks = [];
      open();
    }
  });
}

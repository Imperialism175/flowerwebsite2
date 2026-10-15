// звуковые эффекты синтезируются на лету — никаких файлов
let ctx = null;
let master = null;
let enabled = true;
let armed = false; // до первого действия человека браузер звук всё равно не даст

export function setSfxEnabled(on) {
  enabled = on;
}

function audio() {
  if (!enabled || !armed) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// одна нота музыкальной шкатулки: синус + тихие обертоны, быстрое затухание
function bell(freq, { at = 0, len = 0.9, vol = 1, type = 'sine' } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  [
    [1, vol],
    [2.01, vol * 0.25],
    [3.98, vol * 0.08],
  ].forEach(([mul, v]) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len / mul);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + len);
  });
}

function noise({ at = 0, len = 0.25, vol = 0.5, from = 800, to = 3000 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + len);
  const g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + len * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// пентатоника — любые ноты подряд звучат красиво
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
const pick = () => SCALE[Math.floor(Math.random() * SCALE.length)];

export const sfx = {
  hover: () => bell(pick() * 2, { len: 0.35, vol: 0.18 }),
  click: () => bell(pick(), { len: 0.8, vol: 0.5 }),
  open: () => [0, 1, 2].forEach((i) => bell(SCALE[i * 2], { at: i * 0.06, len: 0.6, vol: 0.3 })),
  close: () => [2, 1, 0].forEach((i, k) => bell(SCALE[i * 2], { at: k * 0.06, len: 0.5, vol: 0.25 })),
  pick: () => {
    noise({ len: 0.12, vol: 0.35, from: 2000, to: 600 });
    bell(392, { len: 0.3, vol: 0.3, type: 'triangle' });
  },
  drop: () => bell(261.63, { len: 0.4, vol: 0.4, type: 'triangle' }),
  plant: () => {
    noise({ len: 0.4, vol: 0.4, from: 300, to: 1800 });
    [0, 2, 4, 7].forEach((n, i) => bell(SCALE[n], { at: 0.08 + i * 0.07, len: 1.2, vol: 0.35 }));
  },
  whoosh: () => noise({ len: 0.5, vol: 0.25, from: 400, to: 4000 }),
};

// звуки интерфейса: наведение на карточки и ссылки, клики, раскрытие блоков
export function initSfx() {
  const arm = () => (armed = true);
  window.addEventListener('pointerdown', arm, { capture: true, once: true });
  window.addEventListener('keydown', arm, { capture: true, once: true });

  let lastHover = null;
  let lastAt = 0;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('a, button, summary, .card, .sticker');
    if (!el || el === lastHover) return;
    lastHover = el;
    const now = performance.now();
    if (now - lastAt < 90) return;
    lastAt = now;
    sfx.hover();
  });
  document.addEventListener('pointerout', (e) => {
    if (lastHover && !lastHover.contains(e.relatedTarget)) lastHover = null;
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('a')) sfx.click();
  });
  document.addEventListener(
    'toggle',
    (e) => {
      if (e.target.matches?.('details.fold')) e.target.open ? sfx.open() : sfx.close();
    },
    true,
  );
}

import './style.css';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { content } from './content.js';
import { createScene } from './scene.js';
import { renderPage, initStickers } from './ui.js';
import { initMusic } from './music.js';
import { initSfx, sfx } from './sfx.js';
import { initAdmin, loadContent } from './admin.js';

gsap.registerPlugin(ScrollTrigger);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// история всегда начинается с рассвета
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
// черновик из админки (если есть) показывается только в этом браузере
const site = loadContent(content);
renderPage(site);
initMusic(site.music);
initSfx();
initAdmin(content);

let scene = null;
try {
  // лучи и блики линзы рисуются поверх сцены там, где сейчас солнце
  const sunfx = document.querySelector('#sunfx');
  scene = createScene(document.querySelector('#field'), {
    reducedMotion: reduced,
    onSun({ x, y, strength, color }) {
      sunfx.style.setProperty('--sx', x.toFixed(4));
      sunfx.style.setProperty('--sy', y.toFixed(4));
      sunfx.style.setProperty('--ss', strength.toFixed(3));
      sunfx.style.setProperty('--sc', color);
    },
  });
} catch (err) {
  // без WebGL остаётся тёплый градиент и вся история
  console.warn('WebGL недоступен', err);
  document.documentElement.classList.add('no-webgl');
}

// ---------- плавный скролл ----------
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  if (import.meta.env.DEV) window.lenis = lenis;
}
document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(el, { duration: 2.2 }) : el.scrollIntoView();
  }),
);

// ---------- время суток в шапке ----------
const clockEl = document.querySelector('#clock');
const dayEl = document.querySelector('#daylabel');
const DAY = [
  [0, 'утро'],
  [0.2, 'полдень'],
  [0.4, 'золотой час'],
  [0.62, 'закат'],
  [0.8, 'сумерки'],
  [0.92, 'ночь'],
];
function setDaytime(p) {
  const minutes = 6 * 60 + 40 + p * (17 * 60);
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  dayEl.textContent = DAY.filter(([at]) => p >= at).pop()[1];
  document.documentElement.style.setProperty('--p', p.toFixed(4));
  document.documentElement.classList.toggle('is-night', p > 0.74);
}

// ---------- история: каждая глава ведёт камеру на один шаг маршрута ----------
const chapters = [...document.querySelectorAll('[data-chapter]')];
const STEPS = chapters.length; // 6 глав = 6 отрезков маршрута

function storyProgress(triggers) {
  const y = window.scrollY;
  let t = 0;
  triggers.forEach((st, i) => {
    if (y >= st.start) t = i + Math.min(1, (y - st.start) / Math.max(1, st.end - st.start));
  });
  return Math.min(1, t / STEPS);
}

const mm = gsap.matchMedia();
mm.add(
  { wide: '(min-width: 820px)', narrow: '(max-width: 819.98px)' },
  (ctx) => {
    const { wide } = ctx.conditions;
    const triggers = chapters.map((el, i) => {
      if (el.classList.contains('interests') && wide && !reduced) {
        // горизонтальная прогулка по грядкам
        const track = el.querySelector('.track');
        const head = el.querySelector('.interests-head');
        const distance = () => track.scrollWidth - window.innerWidth + 64;
        return ScrollTrigger.create({
          trigger: el,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: true,
          invalidateOnRefresh: true,
          animation: gsap
            .timeline()
            .to(track, { x: () => -distance(), ease: 'none', duration: 1 }, 0)
            // заголовок уступает место карточкам, когда те до него доезжают
            .to(head, { opacity: 0, y: -30, ease: 'none', duration: 0.12 }, 0.14),
        });
      }
      return ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: i === chapters.length - 1 ? 'bottom bottom' : 'bottom top',
      });
    });
    const update = () => {
      const p = storyProgress(triggers);
      scene?.setProgress(p);
      setDaytime(p);
      document.body.classList.toggle('can-plant', p > 0.9);
    };
    const st = ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
    update();
    return () => st.kill();
  },
);

// ---------- появление текста ----------
if (!reduced) {
  gsap.from('.hero-title .ch', {
    yPercent: 110,
    rotate: 6,
    opacity: 0,
    duration: 1.4,
    ease: 'expo.out',
    stagger: 0.05,
    delay: 0.4,
  });
  gsap.from('.hero [data-fade]', { y: 24, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.15, delay: 1.1 });

  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 85%',
    onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, rotate: 0, duration: 1.1, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });
  gsap.set('[data-reveal]', { y: 50, opacity: 0 });

  // цитата проявляется слово за словом
  gsap.to('.quote .w', {
    opacity: 1,
    filter: 'blur(0px)',
    stagger: 0.08,
    ease: 'none',
    scrollTrigger: { trigger: '.quote', start: 'top 70%', end: 'bottom 60%', scrub: true },
  });

  // заголовки глав слегка плывут
  gsap.utils.toArray('.chapter h2').forEach((h) =>
    gsap.fromTo(h, { yPercent: 30 }, { yPercent: -30, ease: 'none', scrollTrigger: { trigger: h, scrub: true } }),
  );
} else {
  document.documentElement.classList.add('reduced');
}

initStickers(document.querySelector('.board'));
document.querySelectorAll('.sticker').forEach((el) => {
  el.addEventListener('pointerdown', sfx.pick);
  el.addEventListener('pointerup', sfx.drop);
});

// ---------- посадить цветок ночью ----------
const GARDEN_KEY = 'flowertalker-garden';
const counter = document.querySelector('#planted-count');
function readGarden() {
  try {
    return JSON.parse(localStorage.getItem(GARDEN_KEY)) || [];
  } catch {
    return [];
  }
}
if (scene) {
  scene.restore(readGarden());
  counter.textContent = readGarden().length;
  window.addEventListener('click', (e) => {
    if (!document.body.classList.contains('can-plant')) return;
    if (e.target.closest('a, button, .card, .links')) return;
    if (!scene.plantAt(e.clientX, e.clientY)) return;
    try {
      localStorage.setItem(GARDEN_KEY, JSON.stringify(scene.planted));
    } catch {
      /* без памяти — просто не сохраним */
    }
    counter.textContent = scene.planted.length;
    sfx.plant();
    const tip = document.querySelector('.plant-tip');
    tip.classList.add('done');
  });
}

window.addEventListener('load', () => ScrollTrigger.refresh());

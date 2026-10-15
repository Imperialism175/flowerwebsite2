// фоновая музыка: звук из YouTube-плеера, сам плеер скрыт
import { setSfxEnabled, sfx } from './sfx.js';

const PREF_KEY = 'flowertalker:music';

function readPref() {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

function savePref(value) {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch {
    /* без хранилища просто не запоминаем выбор */
  }
}

function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  return new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function initMusic({ youtube: VIDEO_ID = 'vhrHa8lmj6o', volume = 20 } = {}) {
  const btn = document.querySelector('#music');
  const dock = document.querySelector('#musicdock');
  if (!btn || !dock) return;

  let player = null;
  let ready = null;
  let playing = false;

  const setState = (on) => {
    playing = on;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Выключить музыку' : 'Включить музыку');
    document.documentElement.classList.toggle('music-on', on);
  };

  const ensurePlayer = () =>
    (ready ??= loadApi().then(
      (YT) =>
        new Promise((resolve) => {
          player = new YT.Player('ytplayer', {
            videoId: VIDEO_ID,
            width: 200,
            height: 113,
            playerVars: { loop: 1, playlist: VIDEO_ID, playsinline: 1, rel: 0 },
            events: {
              onReady: (e) => {
                e.target.setVolume(volume);
                resolve(player);
              },
              onStateChange: (e) => {
                if (e.data === YT.PlayerState.PLAYING) setState(true);
                else if (e.data === YT.PlayerState.PAUSED) setState(false);
              },
            },
          });
        }),
    ));

  const play = () => {
    setState(true);
    ensurePlayer()
      .then((p) => p.playVideo())
      .catch(() => {
        setState(false);
        btn.hidden = true;
      });
  };

  const pause = () => {
    setState(false);
    player?.pauseVideo();
  };

  // кнопка ♪ выключает весь звук сайта: и музыку, и эффекты
  setSfxEnabled(readPref() !== 'off');
  btn.addEventListener('click', () => {
    if (playing) {
      sfx.close();
      setSfxEnabled(false);
      pause();
      savePref('off');
    } else {
      setSfxEnabled(true);
      sfx.open();
      play();
      savePref('on');
    }
  });

  // звук браузер разрешает только после действия человека
  if (readPref() !== 'off') {
    const start = (e) => {
      if (btn.contains(e.target)) return;
      off();
      play();
    };
    const off = () => {
      window.removeEventListener('pointerdown', start, true);
      window.removeEventListener('keydown', start, true);
    };
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('keydown', start, true);
    btn.addEventListener('click', off, { once: true });
  }
}

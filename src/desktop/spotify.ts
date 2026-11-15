import { dismissDisclosure } from './disclosures';
import { alignCompactMusicStatus, coverColor, initMusicWaves } from './musicVisuals';

interface Track {
  title: string;
  artist: string;
  cover?: string;
  url: string;
  duration_ms?: number | null;
}
type Playback = ({ playing: true; progress_ms?: number | null } & Track) | { playing: false };
export interface Listening {
  tracks: Track[] | null;
  artists: { name: string; image?: string; url: string }[] | null;
  artistSource: 'top' | 'recent';
}

export function timecode(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function shuffled(tracks: Track[]) {
  const order = [...tracks];
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

export function initSpotify(t: (key: string) => string, mobile: MediaQueryList, showListening: (data: Listening | null) => void) {
  const bar = document.querySelector<HTMLElement>('[data-spotify-endpoint]');
  if (!bar) return { updateLanguage() {}, loadListening: () => showListening(null) };
  const endpoint = bar.dataset.spotifyEndpoint!;
  const historyEndpoint = new URL('/listening', endpoint).href;
  const pill = bar.querySelector<HTMLElement>('[data-spotify-pill]')!;
  const panel = bar.querySelector<HTMLElement>('.music-menu')!;
  const clockMenu = bar.querySelector<HTMLElement>('.clock-menu')!;
  const clockTrigger = clockMenu.querySelector<HTMLButtonElement>('.clock-trigger')!;
  const quickCard = bar.querySelector<HTMLElement>('.quick-music')!;
  const quickMenu = quickCard.closest<HTMLElement>('[data-disclosure]')!;
  const setWavePlaying = initMusicWaves(bar);
  alignCompactMusicStatus(quickCard);
  const timelines = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-timeline]'), (element) => ({
    element,
    owner: element.closest<HTMLElement>('[data-disclosure]')!,
    progress: element.querySelector<HTMLElement>('[data-spotify-progress]')!,
    elapsed: element.querySelector<HTMLElement>('[data-spotify-elapsed]')!,
    duration: element.querySelector<HTMLElement>('[data-spotify-duration]')!,
  }));
  const coverImages = Array.from(bar.querySelectorAll<HTMLImageElement>('[data-spotify-cover]'));
  const active = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-playing]'));
  const recent = clockMenu.querySelector<HTMLElement>('[data-spotify-recent]')!;
  const display = clockMenu.querySelector<HTMLElement>('[data-spotify-display]')!;
  const status = clockMenu.querySelector<HTMLElement>('[data-spotify-status]')!;
  const titles = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-title]'));
  const artists = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-artist]'));
  const links = Array.from(bar.querySelectorAll<HTMLAnchorElement>('[data-spotify-link]'));

  let playback: Playback = { playing: false };
  let state: 'loading' | 'active' | 'idle' | 'unavailable' = 'loading';
  let sampledAt = 0;
  let lastFetch = -Infinity;
  let refreshing = false;
  let timer: number | undefined;
  let currentCover: string | undefined;
  let lastHistoryFetch = -Infinity;
  let historyRequest: Promise<void> | undefined;
  let historyKey: string | undefined;
  let recentOrder: Track[] = [];
  let recentIndex = 0;

  function updateCoverColor(url: string | undefined) {
    if (url === currentCover) return;
    currentCover = url;
    function applyColor(rgb: number[] | null) {
      const css = (values: number[]) => `rgb(${values.join(' ')})`;
      bar!.style.setProperty('--track-color', rgb ? css(rgb) : '');
      bar!.style.setProperty('--wave-dark', rgb ? css(rgb.map((value) => Math.min(255, value + 100))) : '');
      bar!.style.setProperty('--wave-light', rgb ? css(rgb.map((value) => Math.max(25, Math.min(135, Math.floor(value * .55))))) : '');
      setWavePlaying(playback.playing);
    }
    if (!url) applyColor(null);
    else void coverColor(url).catch(() => null).then((rgb) => {
      if (currentCover === url) applyColor(rgb);
    });
  }
  function updateLanguage() {
    status.textContent = t(state === 'idle' ? 'spotifyIdle' : state === 'unavailable' ? 'spotifyUnavailable' : 'spotifyLoading');
  }

  function runProgress() {
    clearInterval(timer);
    const track = playback;
    const openTimelines = timelines.filter(({ owner }) =>
      owner.hasAttribute('data-open') && (owner !== quickMenu || quickCard.clientWidth > 0));
    if (!openTimelines.length) return;
    if (!track.playing || typeof track.progress_ms !== 'number' || !track.duration_ms) {
      openTimelines.forEach(({ element }) => { element.hidden = true; });
      return;
    }
    const start = track.progress_ms;
    const total = track.duration_ms;
    function update() {
      const position = Math.min(total, Math.max(0, start + performance.now() - sampledAt));
      const fraction = position / total;
      for (const { element, elapsed, duration, progress } of openTimelines) {
        element.hidden = false;
        elapsed.textContent = timecode(position);
        duration.textContent = timecode(total);
        progress.style.setProperty('--position', String(fraction));
        progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      }
    }
    update();
    timer = window.setInterval(update, 500);
  }

  coverImages.forEach((img) => {
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.classList.remove('loaded'));
  });

  function render() {
    const track = playback.playing ? playback : null;
    const recentTrack = state === 'idle' && !mobile.matches ? recentOrder[recentIndex] : undefined;
    const shown = track ?? recentTrack;
    if (!track && !panel.hidden) {
      const hadFocus = panel.contains(document.activeElement);
      if (panel.hasAttribute('data-open')) dismissDisclosure();
      if (hadFocus) clockTrigger.focus({ preventScroll: true });
    }
    panel.inert = !track;
    panel.hidden = !track;
    bar!.toggleAttribute('data-playing', Boolean(track));
    setWavePlaying(Boolean(track));
    if (track) {
      pill.textContent = `${track.title} • ${track.artist}`;
      updateCoverColor(track.cover);
      if (track.cover) bar!.style.setProperty('--track-art', `url("${track.cover.replaceAll('"', '%22')}")`);
      else bar!.style.removeProperty('--track-art');
    }
    quickCard.hidden = !track;
    active.forEach((node) => { node.hidden = !track; });
    recent.hidden = !recentTrack;
    display.hidden = !shown;
    status.hidden = Boolean(shown);
    if (shown) {
      titles.forEach((node) => { node.textContent = shown.title; });
      artists.forEach((node) => { node.textContent = shown.artist; });
    }
    for (const img of coverImages) {
      if (!track && !clockMenu.contains(img)) continue;
      if ((shown?.cover ?? null) === img.getAttribute('src')) continue;
      img.classList.remove('loaded');
      if (shown?.cover) img.src = shown.cover;
      else img.removeAttribute('src');
    }
    for (const link of links) {
      const url = shown?.url;
      link.hidden = !url?.startsWith('https://open.spotify.com/');
      if (link.hidden) link.removeAttribute('href');
      else link.href = url!;
    }
    runProgress();
    updateLanguage();
  }

  function loadListening() {
    if (historyRequest || performance.now() - lastHistoryFetch < 120_000) return;
    lastHistoryFetch = performance.now();
    historyRequest = fetch(historyEndpoint)
      .then((response) => {
        if (!response.ok) throw new Error('Spotify history unavailable');
        return response.json() as Promise<Listening>;
      })
      .then((listening) => {
        showListening(listening);
        const tracks = listening.tracks ?? [];
        const key = tracks.map((track) => track.url).join('\n');
        if (key !== historyKey) {
          const previous = recentOrder[recentIndex];
          historyKey = key;
          recentOrder = shuffled(tracks);
          recentIndex = Math.max(0, recentOrder.findIndex((track) => track.url === previous?.url));
        }
        render();
      })
      .catch(() => {
        if (historyKey === undefined) showListening(null);
      })
      .finally(() => { historyRequest = undefined; });
  }

  async function refresh() {
    if (refreshing || performance.now() - lastFetch < 5000) return;
    refreshing = true;
    lastFetch = performance.now();
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Spotify unavailable');
      playback = await response.json();
      sampledAt = performance.now();
      state = playback.playing ? 'active' : 'idle';
    } catch {
      playback = { playing: false };
      state = 'unavailable';
    } finally {
      refreshing = false;
      render();
      if (state === 'idle' && !mobile.matches) loadListening();
    }
  }

  window.setInterval(() => {
    if (state === 'idle' && recentOrder.length > 1 && !document.hidden && !mobile.matches) {
      recentIndex = (recentIndex + 1) % recentOrder.length;
      render();
    }
  }, 14_000);

  for (const menu of [panel, quickMenu, clockMenu]) {
    menu.addEventListener('disclosurechange', () => {
      runProgress();
      if (menu.hasAttribute('data-open') && (menu !== quickMenu || quickCard.clientWidth > 0)) void refresh();
    });
  }
  mobile.addEventListener('change', () => {
    render();
    if (state === 'idle' && !mobile.matches) loadListening();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  void refresh();
  window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
  return { updateLanguage, loadListening };
}

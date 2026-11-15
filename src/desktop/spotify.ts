import { coverColor, initMusicWaves } from './musicVisuals';

type Playback = {
  playing: true;
  title: string;
  artist: string;
  cover?: string;
  url?: string;
  progress_ms?: number | null;
  duration_ms?: number | null;
} | { playing: false };

function timecode(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function initSpotify(t: (key: string) => string) {
  const bar = document.querySelector<HTMLElement>('[data-spotify-endpoint]');
  if (!bar) return () => {};

  const pill = bar.querySelector<HTMLElement>('[data-spotify-pill]')!;
  const coverImages = Array.from(bar.querySelectorAll<HTMLImageElement>('[data-spotify-cover]'));
  const panel = bar.querySelector<HTMLElement>('.music-menu')!;
  const quickCard = bar.querySelector<HTMLElement>('.quick-music')!;
  const quickMenu = quickCard.closest<HTMLElement>('[data-disclosure]')!;
  const setWavePlaying = initMusicWaves(bar);
  const timelines = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-timeline]'), (element) => ({
    element,
    owner: element.closest<HTMLElement>('[data-disclosure]')!,
    progress: element.querySelector<HTMLElement>('[data-spotify-progress]')!,
    elapsed: element.querySelector<HTMLElement>('[data-spotify-elapsed]')!,
    duration: element.querySelector<HTMLElement>('[data-spotify-duration]')!,
  }));
  const tracks = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-playing]'));
  const idle = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-idle]'));
  const statuses = Array.from(bar.querySelectorAll<HTMLElement>('[data-spotify-status]'));
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
  function renderText() {
    const status = t(state === 'idle' ? 'spotifyIdle' : state === 'unavailable' ? 'spotifyUnavailable' : 'spotifyLoading');
    statuses.forEach((text) => { text.textContent = status; });
    pill.textContent = playback.playing ? `${playback.title} • ${playback.artist}` : 'Spotify';
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
    bar!.toggleAttribute('data-playing', Boolean(track));
    setWavePlaying(Boolean(track));
    updateCoverColor(track?.cover);
    tracks.forEach((node) => { node.hidden = !track; });
    idle.forEach((node) => { node.hidden = Boolean(track); });
    if (track) {
      titles.forEach((node) => { node.textContent = track.title; });
      artists.forEach((node) => { node.textContent = track.artist; });
    }
    for (const img of coverImages) {
      if (track?.cover === img.getAttribute('src')) continue;
      img.classList.remove('loaded');
      if (track?.cover) img.src = track.cover;
      else img.removeAttribute('src');
    }
    if (track?.cover) bar!.style.setProperty('--track-art', `url("${track.cover.replaceAll('"', '%22')}")`);
    else bar!.style.removeProperty('--track-art');
    for (const link of links) {
      const url = track?.url;
      link.hidden = !url?.startsWith('https://open.spotify.com/');
      if (!link.hidden) link.href = url!;
      else link.removeAttribute('href');
    }
    runProgress();
    renderText();
  }

  async function refresh() {
    if (refreshing || performance.now() - lastFetch < 5000) return;
    refreshing = true;
    lastFetch = performance.now();
    try {
      const response = await fetch(bar!.dataset.spotifyEndpoint!);
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
    }
  }

  for (const menu of [panel, quickMenu, bar.querySelector<HTMLElement>('.clock-menu')!]) {
    menu.addEventListener('disclosurechange', () => {
      runProgress();
      if (menu.hasAttribute('data-open') && (menu !== quickMenu || quickCard.clientWidth > 0)) void refresh();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  void refresh();
  window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
  return renderText;
}
